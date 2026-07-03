import base64
import os
import hashlib
from cryptography.hazmat.primitives.asymmetric import x25519, ed25519
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from app.core.config import settings

def generate_x25519_key_pair() -> tuple[bytes, bytes]:
    """
    Generates a new X25519 key pair.
    Returns: (private_bytes, public_bytes)
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

def generate_ed25519_key_pair() -> tuple[bytes, bytes]:
    """
    Generates a new Ed25519 key pair.
    Returns: (private_bytes, public_bytes)
    """
    priv = ed25519.Ed25519PrivateKey.generate()
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

def serialize_public_key(pub_bytes: bytes) -> str:
    return base64.b64encode(pub_bytes).decode('utf-8')

def deserialize_public_key(pub_str: str) -> bytes:
    return base64.b64decode(pub_str)

def get_aes_key() -> bytes:
    return hashlib.sha256(settings.SECRET_KEY.encode('utf-8')).digest()

def encrypt_private_key(private_bytes: bytes) -> str:
    """
    Encrypts raw private key bytes using AES-GCM-256 with server-side SECRET_KEY.
    Returns Base64 representation of combined nonce + ciphertext.
    """
    aes_key = get_aes_key()
    aesgcm = AESGCM(aes_key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, private_bytes, None)
    combined = nonce + ciphertext
    return base64.b64encode(combined).decode('utf-8')

def decrypt_private_key(encrypted_base64: str) -> bytes:
    """
    Decrypts the private key using AES-GCM-256 with server-side SECRET_KEY.
    """
    aes_key = get_aes_key()
    aesgcm = AESGCM(aes_key)
    combined = base64.b64decode(encrypted_base64)
    nonce = combined[:12]
    ciphertext = combined[12:]
    return aesgcm.decrypt(nonce, ciphertext, None)
