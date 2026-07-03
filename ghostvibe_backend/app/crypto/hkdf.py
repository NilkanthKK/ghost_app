from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes

def hkdf_derive(secret: bytes, salt: bytes, info: bytes, length: int) -> bytes:
    """
    Derives keying material using HKDF-SHA256.
    """
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=length,
        salt=salt,
        info=info
    )
    return hkdf.derive(secret)
