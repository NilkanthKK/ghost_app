import os
import json
import base64
import hmac
import hashlib
from typing import Optional
from cryptography.hazmat.primitives.asymmetric import x25519
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from app.crypto.hkdf import hkdf_derive
from app.crypto.identity_keys import (
    encrypt_private_key,
    decrypt_private_key,
    serialize_public_key,
    deserialize_public_key
)

MAX_SKIPPED_KEYS = 1000

class SessionState:
    def __init__(
        self,
        root_key: bytes,
        dh_pair_private: bytes,
        dh_pair_public: bytes,
        remote_dh_public: Optional[bytes] = None,
        sending_chain_key: Optional[bytes] = None,
        receiving_chain_key: Optional[bytes] = None,
        skipped_message_keys: Optional[dict] = None,
        send_count: int = 0,
        receive_count: int = 0,
        previous_chain_length: int = 0
    ):
        self.root_key = root_key
        self.dh_pair_private = dh_pair_private
        self.dh_pair_public = dh_pair_public
        self.remote_dh_public = remote_dh_public
        self.sending_chain_key = sending_chain_key
        self.receiving_chain_key = receiving_chain_key
        self.skipped_message_keys = skipped_message_keys or {}  # Key: "pubkey_base64:msg_num", Value: message_key_bytes
        self.send_count = send_count
        self.receive_count = receive_count
        self.previous_chain_length = previous_chain_length

def kdf_rk(rk: bytes, dh_out: bytes) -> tuple[bytes, bytes]:
    """
    HKDF-SHA256 advancing Root Chain.
    Returns: (root_key_next, chain_key)
    """
    derived = hkdf_derive(secret=dh_out, salt=rk, info=b"WhisperRatchetRoot", length=64)
    return derived[:32], derived[32:]

def kdf_ck(ck: bytes) -> tuple[bytes, bytes]:
    """
    HMAC-SHA256 advancing Chain Key.
    Returns: (chain_key_next, message_key)
    """
    mk = hmac.new(ck, b"\x01", hashlib.sha256).digest()
    ck_next = hmac.new(ck, b"\x02", hashlib.sha256).digest()
    return ck_next, mk

def compute_dh(priv_bytes: bytes, pub_bytes: bytes) -> bytes:
    """
    Computes X25519 Diffie-Hellman output.
    """
    priv_key = x25519.X25519PrivateKey.from_private_bytes(priv_bytes)
    pub_key = x25519.X25519PublicKey.from_public_bytes(pub_bytes)
    return priv_key.exchange(pub_key)

def generate_dh_pair() -> tuple[bytes, bytes]:
    """
    Generates a new ephemeral X25519 key pair.
    """
    priv = x25519.X25519PrivateKey.generate()
    pub = priv.public_key()
    
    priv_bytes = priv.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption()
    )
    pub_bytes = pub.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw
    )
    return priv_bytes, pub_bytes

# AES-256-GCM encryption/decryption helpers
def encrypt_aes_gcm(plaintext: bytes, key: bytes) -> str:
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)
    combined = nonce + ciphertext
    return base64.b64encode(combined).decode('utf-8')

def decrypt_aes_gcm(ciphertext_b64: str, key: bytes) -> bytes:
    aesgcm = AESGCM(key)
    combined = base64.b64decode(ciphertext_b64)
    nonce = combined[:12]
    ciphertext = combined[12:]
    return aesgcm.decrypt(nonce, ciphertext, None)

# X3DH Session Initiation Shared Key Derivations
def derive_x3dh_initiator(
    alice_identity_private: bytes,
    alice_ephemeral_private: bytes,
    bob_identity_public: bytes,
    bob_signed_public: bytes,
    bob_one_time_public: Optional[bytes] = None
) -> bytes:
    dh1 = compute_dh(alice_identity_private, bob_signed_public)
    dh2 = compute_dh(alice_ephemeral_private, bob_identity_public)
    dh3 = compute_dh(alice_ephemeral_private, bob_signed_public)
    
    ikm = dh1 + dh2 + dh3
    if bob_one_time_public:
        dh4 = compute_dh(alice_ephemeral_private, bob_one_time_public)
        ikm += dh4
        
    return hkdf_derive(
        secret=ikm,
        salt=b"\x00" * 32,
        info=b"WhisperText",
        length=32
    )

def derive_x3dh_responder(
    bob_identity_private: bytes,
    bob_signed_private: bytes,
    alice_identity_public: bytes,
    alice_ephemeral_public: bytes,
    bob_one_time_private: Optional[bytes] = None
) -> bytes:
    dh1 = compute_dh(bob_signed_private, alice_identity_public)
    dh2 = compute_dh(bob_identity_private, alice_ephemeral_public)
    dh3 = compute_dh(bob_signed_private, alice_ephemeral_public)
    
    ikm = dh1 + dh2 + dh3
    if bob_one_time_private:
        dh4 = compute_dh(bob_one_time_private, alice_ephemeral_public)
        ikm += dh4
        
    return hkdf_derive(
        secret=ikm,
        salt=b"\x00" * 32,
        info=b"WhisperText",
        length=32
    )

# Double Ratchet Encryption & Decryption steps
def ratchet_encrypt(state: SessionState, plaintext: bytes) -> dict:
    """
    Advances sending chain, derives message key, and encrypts message.
    """
    if not state.sending_chain_key:
        raise ValueError("Sending chain key not initialized")
        
    state.sending_chain_key, mk = kdf_ck(state.sending_chain_key)
    ciphertext = encrypt_aes_gcm(plaintext, mk)
    state.send_count += 1
    
    return {
        "ciphertext": ciphertext,
        "dh_pub": serialize_public_key(state.dh_pair_public),
        "msg_num": state.send_count - 1,
        "prev_chain_len": state.previous_chain_length
    }

def ratchet_decrypt(
    state: SessionState,
    ciphertext: str,
    remote_dh_pub: bytes,
    msg_num: int,
    prev_chain_len: int
) -> bytes:
    """
    Advances receiving chain, checks skipped keys, performs DH steps, and decrypts.
    """
    pub_str = serialize_public_key(remote_dh_pub)
    key_str = f"{pub_str}:{msg_num}"
    
    # 1. Try skipped message keys first
    if key_str in state.skipped_message_keys:
        mk = state.skipped_message_keys[key_str]
        plaintext = decrypt_aes_gcm(ciphertext, mk)
        del state.skipped_message_keys[key_str]
        return plaintext
        
    # 2. Check if remote advanced DH public key
    if state.remote_dh_public is None or remote_dh_pub != state.remote_dh_public:
        # Skip messages in current receiving chain up to previous chain length
        if state.receiving_chain_key:
            while state.receive_count < prev_chain_len:
                state.receiving_chain_key, mk = kdf_ck(state.receiving_chain_key)
                old_pub_str = serialize_public_key(state.remote_dh_public)
                old_key_str = f"{old_pub_str}:{state.receive_count}"
                state.skipped_message_keys[old_key_str] = mk
                state.receive_count += 1
                if len(state.skipped_message_keys) > MAX_SKIPPED_KEYS:
                    raise ValueError("Max skipped message keys limit reached")
                    
        # Perform DH Ratchet Step
        dh_out = compute_dh(state.dh_pair_private, remote_dh_pub)
        state.root_key, state.receiving_chain_key = kdf_rk(state.root_key, dh_out)
        state.remote_dh_public = remote_dh_pub
        state.receive_count = 0
        
        # Ephemeral update for sending chain
        state.dh_pair_private, state.dh_pair_public = generate_dh_pair()
        dh_out_new = compute_dh(state.dh_pair_private, state.remote_dh_public)
        state.root_key, state.sending_chain_key = kdf_rk(state.root_key, dh_out_new)
        state.previous_chain_length = state.send_count
        state.send_count = 0
        
    # 3. Skip messages in current receiving chain up to msg_num
    while state.receive_count < msg_num:
        state.receiving_chain_key, mk = kdf_ck(state.receiving_chain_key)
        curr_pub_str = serialize_public_key(state.remote_dh_public)
        curr_key_str = f"{curr_pub_str}:{state.receive_count}"
        state.skipped_message_keys[curr_key_str] = mk
        state.receive_count += 1
        if len(state.skipped_message_keys) > MAX_SKIPPED_KEYS:
            raise ValueError("Max skipped message keys limit reached")
            
    # 4. Advance receiving chain for current message
    state.receiving_chain_key, mk = kdf_ck(state.receiving_chain_key)
    state.receive_count += 1
    
    return decrypt_aes_gcm(ciphertext, mk)

# Database Serialization & Deserialization Mapping Helpers
def serialize_session(state: SessionState) -> dict:
    root_key_enc = encrypt_private_key(state.root_key)
    sending_chain_enc = encrypt_private_key(state.sending_chain_key) if state.sending_chain_key else None
    receiving_chain_enc = encrypt_private_key(state.receiving_chain_key) if state.receiving_chain_key else None
    
    dh_priv_enc = encrypt_private_key(state.dh_pair_private)
    dh_pub_str = serialize_public_key(state.dh_pair_public)
    dh_pair_serialized = json.dumps({
        "priv_enc": dh_priv_enc,
        "pub": dh_pub_str
    })
    
    remote_dh_pub_str = serialize_public_key(state.remote_dh_public) if state.remote_dh_public else None
    
    # Encrypt skipped message keys values
    skipped_enc = {}
    for key, mk in state.skipped_message_keys.items():
        skipped_enc[key] = encrypt_private_key(mk)
        
    return {
        "root_key": root_key_enc,
        "sending_chain": sending_chain_enc,
        "receiving_chain": receiving_chain_enc,
        "dh_pair": dh_pair_serialized,
        "remote_dh_public": remote_dh_pub_str,
        "skipped_keys_json": json.dumps(skipped_enc),
        "send_count": state.send_count,
        "receive_count": state.receive_count,
        "previous_chain_length": state.previous_chain_length
    }

def deserialize_session(db_session) -> SessionState:
    root_key = decrypt_private_key(db_session.root_key)
    sending_chain_key = decrypt_private_key(db_session.sending_chain) if db_session.sending_chain else None
    receiving_chain_key = decrypt_private_key(db_session.receiving_chain) if db_session.receiving_chain else None
    
    dh_pair_data = json.loads(db_session.dh_pair)
    dh_pair_private = decrypt_private_key(dh_pair_data["priv_enc"])
    dh_pair_public = deserialize_public_key(dh_pair_data["pub"])
    
    remote_dh_public = deserialize_public_key(db_session.remote_dh_public) if db_session.remote_dh_public else None
    
    skipped_enc = json.loads(db_session.skipped_keys_json) if db_session.skipped_keys_json else {}
    skipped_message_keys = {}
    for key, mk_enc in skipped_enc.items():
        skipped_message_keys[key] = decrypt_private_key(mk_enc)
        
    return SessionState(
        root_key=root_key,
        dh_pair_private=dh_pair_private,
        dh_pair_public=dh_pair_public,
        remote_dh_public=remote_dh_public,
        sending_chain_key=sending_chain_key,
        receiving_chain_key=receiving_chain_key,
        skipped_message_keys=skipped_message_keys,
        send_count=db_session.send_count,
        receive_count=db_session.receive_count,
        previous_chain_length=db_session.previous_chain_length
    )
