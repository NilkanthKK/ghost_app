import os
import json
import base64
import hmac
import hashlib
from typing import Optional, Dict
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization
from app.crypto.hkdf import hkdf_derive
from app.crypto.identity_keys import (
    encrypt_private_key,
    decrypt_private_key,
    serialize_public_key,
    deserialize_public_key
)
from app.crypto import signatures

MAX_SKIPPED_KEYS = 1000

class GroupSenderKey:
    def __init__(
        self,
        chain_key: bytes,
        signature_key_public: bytes,
        signature_key_private: Optional[bytes] = None,
        msg_count: int = 0
    ):
        self.chain_key = chain_key
        self.signature_key_public = signature_key_public
        self.signature_key_private = signature_key_private
        self.msg_count = msg_count

def kdf_group_ck(ck: bytes) -> tuple[bytes, bytes]:
    """
    KDF Group Chain Key step using HMAC-SHA256.
    Returns: (chain_key_next, message_key)
    """
    mk = hmac.new(ck, b"\x01", hashlib.sha256).digest()
    ck_next = hmac.new(ck, b"\x02", hashlib.sha256).digest()
    return ck_next, mk

def generate_sender_key_pair() -> tuple[bytes, bytes, bytes]:
    """
    Generates a new Chain Key and an Ed25519 Signature Key Pair.
    Returns: (chain_key, signature_private, signature_public)
    """
    ck = os.urandom(32)
    sig_priv = ed25519.Ed25519PrivateKey.generate()
    sig_pub = sig_priv.public_key()
    
    priv_bytes = sig_priv.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption()
    )
    pub_bytes = sig_pub.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw
    )
    return ck, priv_bytes, pub_bytes

def group_encrypt(
    sender_key: GroupSenderKey,
    plaintext: bytes
) -> dict:
    """
    Encrypts a group message payload using our own Sender Key.
    """
    if sender_key.signature_key_private is None:
        raise ValueError("Cannot encrypt: private signature key not provided")
        
    sender_key.chain_key, mk = kdf_group_ck(sender_key.chain_key)
    from app.crypto.double_ratchet import encrypt_aes_gcm
    ciphertext = encrypt_aes_gcm(plaintext, mk)
    
    # Sign the ciphertext
    sig = signatures.sign(sender_key.signature_key_private, ciphertext.encode('utf-8'))
    sig_str = base64.b64encode(sig).decode('utf-8')
    
    sender_key.msg_count += 1
    
    return {
        "ciphertext": ciphertext,
        "signature": sig_str,
        "msg_num": sender_key.msg_count - 1
    }

def group_decrypt(
    sender_key: GroupSenderKey,
    ciphertext: str,
    signature: str,
    msg_num: int,
    skipped_keys: Dict[int, bytes]
) -> bytes:
    """
    Decrypts a group message using the sender's Sender Key.
    """
    # 1. Verify signature
    sig_bytes = base64.b64decode(signature)
    verified = signatures.verify(sender_key.signature_key_public, sig_bytes, ciphertext.encode('utf-8'))
    if not verified:
        raise ValueError("Invalid signature on group message")
        
    # 2. Check skipped keys
    if msg_num in skipped_keys:
        mk = skipped_keys[msg_num]
        from app.crypto.double_ratchet import decrypt_aes_gcm
        plaintext = decrypt_aes_gcm(ciphertext, mk)
        del skipped_keys[msg_num]
        return plaintext
        
    # 3. Advance chain key up to msg_num
    while sender_key.msg_count < msg_num:
        sender_key.chain_key, mk = kdf_group_ck(sender_key.chain_key)
        skipped_keys[sender_key.msg_count] = mk
        sender_key.msg_count += 1
        if len(skipped_keys) > MAX_SKIPPED_KEYS:
            raise ValueError("Max skipped group keys limit reached")
            
    # 4. Advance for the current message
    sender_key.chain_key, mk = kdf_group_ck(sender_key.chain_key)
    sender_key.msg_count += 1
    
    from app.crypto.double_ratchet import decrypt_aes_gcm
    return decrypt_aes_gcm(ciphertext, mk)
