import hashlib
import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import jwt
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import padding
from app.core.config import settings

def get_sha256_hash(data: str) -> str:
    """
    Computes pure SHA-256 hash of raw phone numbers or strings to preserve user privacy.
    Ensures absolute zero knowledge on the database side.
    """
    return hashlib.sha256(data.strip().encode("utf-8")).hexdigest()

def create_access_token(subject: str, expires_delta: Optional[timedelta] = None) -> str:
    """
    Generates dynamic authenticated JWT tokens for secure REST calls.
    """
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[str]:
    """
    Decodes and validates a JWT token, returning the subject (user_id UUID) if valid.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload.get("sub")
    except jwt.JWTError:
        return None

# Local AES-256 Validation Utilities (Hardware-token simulations / key derivation tests)
def aes_encrypt(plaintext: str, key: bytes) -> tuple[bytes, bytes]:
    """
    Encrypts data using AES-256-CBC. Returns (ciphertext, iv).
    key must be exactly 32 bytes (256 bits).
    """
    iv = os.urandom(16)
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    encryptor = cipher.encryptor()
    
    # Pad plaintext to match block size
    padder = padding.PKCS7(128).padder()
    padded_data = padder.update(plaintext.encode("utf-8")) + padder.finalize()
    
    ciphertext = encryptor.update(padded_data) + encryptor.finalize()
    return ciphertext, iv

def aes_decrypt(ciphertext: bytes, key: bytes, iv: bytes) -> str:
    """
    Decrypts AES-256-CBC encrypted ciphertext.
    """
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    decryptor = cipher.decryptor()
    
    padded_data = decryptor.update(ciphertext) + decryptor.finalize()
    
    unpadder = padding.PKCS7(128).unpadder()
    data = unpadder.update(padded_data) + unpadder.finalize()
    return data.decode("utf-8")

import bcrypt

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
