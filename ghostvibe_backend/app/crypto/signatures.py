from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.exceptions import InvalidSignature

def sign(private_key_bytes: bytes, message: bytes) -> bytes:
    """
    Signs a message using the Ed25519 private key.
    """
    private_key = ed25519.Ed25519PrivateKey.from_private_bytes(private_key_bytes)
    return private_key.sign(message)

def verify(public_key_bytes: bytes, signature: bytes, message: bytes) -> bool:
    """
    Verifies a signature using the Ed25519 public key.
    """
    try:
        public_key = ed25519.Ed25519PublicKey.from_public_bytes(public_key_bytes)
        public_key.verify(signature, message)
        return True
    except InvalidSignature:
        return False
    except Exception:
        return False
