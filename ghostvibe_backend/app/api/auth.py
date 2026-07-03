from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from app.database.session import get_db
from app.models.user import User
from app.models.crypto_key import CryptoKey
from app.schemas.auth import OTPTrigger, OTPVerify, Token, PreKeyBundle
from app.core.security import get_sha256_hash, create_access_token
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/otp/trigger", status_code=status.HTTP_200_OK)
async def trigger_otp(payload: OTPTrigger):
    """
    Simulates sending an OTP via Twilio/Firebase.
    For local development and sandboxing, it accepts any phone number
    and returns a success signal with the default OTP '123456'.
    """
    logger.info(f"Triggering OTP for: {payload.phone_number}")
    return {
        "message": "OTP sent successfully (Simulated Gateway)",
        "otp_code": "123456"  # Safe mock code for sandbox testing
    }

@router.post("/otp/verify", response_model=Token)
async def verify_otp(payload: OTPVerify, db: AsyncSession = Depends(get_db)):
    """
    Verifies the OTP (accepts '123456').
    Hashes the phone number to create a 'username_hash'.
    Creates a new user with their Public Identity Key, or updates the keys of an existing user.
    Saves the list of ephemeral public pre-keys, and generates a JWT.
    """
    if payload.otp_code != "123456":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OTP verification code"
        )
    
    # Hash the phone number to prevent storage of raw user contact information
    phone_hash = get_sha256_hash(payload.phone_number)
    logger.info(f"Verifying OTP for username hash: {phone_hash}")
    
    # Check if user already exists
    stmt = select(User).where(User.username_hash == phone_hash)
    result = await db.execute(stmt)
    user = result.scalars().first()
    
    if payload.register_only and user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This mobile number is already registered."
        )
        
    if not user:
        # Create new user
        user = User(
            username_hash=phone_hash,
            phone_number=payload.phone_number,
            identity_key_public=payload.identity_key_public,
            last_login=func.now(),
            last_seen=func.now()
        )
        db.add(user)
        await db.flush()  # Populates user.user_id UUID
    else:
        # Enforce administrative blockings
        if user.is_blocked:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account has been blocked by an administrator."
            )
        if user.is_suspended:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account is currently suspended."
            )
        if user.is_deleted:
            # Restore deleted user
            user.is_deleted = False
            
        user.phone_number = payload.phone_number
        user.last_login = func.now()
        user.last_seen = func.now()
        user.identity_key_public = payload.identity_key_public
        
        # Delete old ephemeral pre-keys
        delete_stmt = delete(CryptoKey).where(CryptoKey.user_id == user.user_id)
        await db.execute(delete_stmt)
    
    # Bulk insert new pre-keys for peer-to-peer Signal handshakes
    for pre_key in payload.pre_keys:
        crypto_key = CryptoKey(
            user_id=user.user_id,
            key_value=pre_key
        )
        db.add(crypto_key)
        
    await db.commit()
    
    # Create session JWT
    access_token = create_access_token(subject=str(user.user_id))
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user_id=user.user_id
    )

@router.get("/pre-key-bundle/{phone_number}", response_model=PreKeyBundle)
async def get_pre_key_bundle(phone_number: str, db: AsyncSession = Depends(get_db)):
    """
    Fetches the Public Cryptographic Key Bundle for a destination user.
    The caller passes the raw phone number (the backend hashes it automatically to locate the user).
    Returns the user's public identity key and one available ephemeral pre-key (and deletes it from the store to prevent reuse).
    """
    phone_hash = get_sha256_hash(phone_number)
    
    # Find user
    stmt = select(User).where(User.username_hash == phone_hash)
    result = await db.execute(stmt)
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not registered on GhostVibe"
        )
        
    # Get one ephemeral pre-key
    key_stmt = select(CryptoKey).where(CryptoKey.user_id == user.user_id).limit(1)
    key_result = await db.execute(key_stmt)
    crypto_key = key_result.scalars().first()
    
    one_time_key = None
    if crypto_key:
        one_time_key = crypto_key.key_value
        # Delete the pre-key so it's only used once (Double Ratchet requirement)
        await db.delete(crypto_key)
        await db.commit()
        
    return PreKeyBundle(
        user_id=user.user_id,
        username_hash=user.username_hash,
        identity_key_public=user.identity_key_public,
        one_time_pre_key=one_time_key
    )
