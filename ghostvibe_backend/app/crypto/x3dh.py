from cryptography.hazmat.primitives.asymmetric import x25519
from cryptography.hazmat.primitives import serialization
from app.crypto import signatures

def generate_signed_prekey(identity_signing_key_bytes: bytes) -> tuple[bytes, bytes, bytes]:
    """
    Generates a new X25519 signed prekey.
    Signs the public key bytes using the Ed25519 identity signing key.
    Returns: (private_bytes, public_bytes, signature_bytes)
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
    
    # Sign public key bytes using Ed25519 private key
    sig = signatures.sign(identity_signing_key_bytes, pub_bytes)
    return priv_bytes, pub_bytes, sig

def generate_one_time_prekeys(count: int) -> list[tuple[bytes, bytes]]:
    """
    Generates a list of count X25519 one-time prekeys.
    Returns: list of (private_bytes, public_bytes)
    """
    keys = []
    for _ in range(count):
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
        keys.append((priv_bytes, pub_bytes))
    return keys

def verify_prekey_bundle(signing_public_key_bytes: bytes, signed_prekey_public_bytes: bytes, signature_bytes: bytes) -> bool:
    """
    Verifies the signed prekey's signature using the identity signing public key.
    """
    return signatures.verify(signing_public_key_bytes, signature_bytes, signed_prekey_public_bytes)
