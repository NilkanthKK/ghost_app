import uuid
import base64
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from app.database.session import get_db
from app.core.flags import flags
from app.core.security import decode_access_token
from app.crypto import identity_keys, x3dh
from app.models.signal_identity import SignalIdentity, OneTimePreKey
from app.schemas.signal import (
    SignalRegisterResponse,
    PreKeyBundleResponse,
    RefreshPreKeysRequest,
    RefreshPreKeysResponse
)
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/signal", tags=["Signal Protocol"])

security = HTTPBearer()

async def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """
    Validates the bearer JWT token and extracts the subject user_id.
    """
    token = credentials.credentials
    user_id = decode_access_token(token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token or expired session"
        )
    return user_id

def check_signal_enabled():
    if not flags.SIGNAL_PROTOCOL_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Signal protocol feature is disabled on the server"
        )

@router.post("/register", response_model=SignalRegisterResponse)
async def register_signal_identity(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    check_signal_enabled()
    user_uuid = uuid.UUID(user_id)
    
    try:
        # Generate new keys
        id_priv, id_pub = identity_keys.generate_x25519_key_pair()
        sig_priv, sig_pub = identity_keys.generate_ed25519_key_pair()
        
        # Generate signed prekey
        spk_priv, spk_pub, spk_sig = x3dh.generate_signed_prekey(sig_priv)
        
        # Serialize public keys & signature
        id_pub_str = identity_keys.serialize_public_key(id_pub)
        sig_pub_str = identity_keys.serialize_public_key(sig_pub)
        spk_pub_str = identity_keys.serialize_public_key(spk_pub)
        spk_sig_str = base64.b64encode(spk_sig).decode('utf-8')
        
        # Encrypt private keys
        id_priv_enc = identity_keys.encrypt_private_key(id_priv)
        sig_priv_enc = identity_keys.encrypt_private_key(sig_priv)
        spk_priv_enc = identity_keys.encrypt_private_key(spk_priv)
        
        # Upsert SignalIdentity
        stmt = select(SignalIdentity).where(SignalIdentity.user_id == user_uuid)
        res = await db.execute(stmt)
        identity = res.scalars().first()
        
        if identity:
            identity.identity_public_key = id_pub_str
            identity.identity_private_key_encrypted = id_priv_enc
            identity.signing_public_key = sig_pub_str
            identity.signing_private_key_encrypted = sig_priv_enc
            identity.signed_prekey_public = spk_pub_str
            identity.signed_prekey_private_encrypted = spk_priv_enc
            identity.signed_prekey_signature = spk_sig_str
            identity.updated_at = func.now() if hasattr(func, 'now') else datetime.utcnow()
        else:
            identity = SignalIdentity(
                user_id=user_uuid,
                identity_public_key=id_pub_str,
                identity_private_key_encrypted=id_priv_enc,
                signing_public_key=sig_pub_str,
                signing_private_key_encrypted=sig_priv_enc,
                signed_prekey_public=spk_pub_str,
                signed_prekey_private_encrypted=spk_priv_enc,
                signed_prekey_signature=spk_sig_str
            )
            db.add(identity)
            
        # Delete old One-Time Prekeys to keep database clean
        del_stmt = delete(OneTimePreKey).where(OneTimePreKey.user_id == user_uuid)
        await db.execute(del_stmt)
        
        # Generate 100 new One-Time Prekeys
        otps = x3dh.generate_one_time_prekeys(100)
        for ot_priv, ot_pub in otps:
            ot_pub_str = identity_keys.serialize_public_key(ot_pub)
            ot_priv_enc = identity_keys.encrypt_private_key(ot_priv)
            otp_record = OneTimePreKey(
                user_id=user_uuid,
                key_public=ot_pub_str,
                key_private_encrypted=ot_priv_enc,
                is_used=False
            )
            db.add(otp_record)
            
        await db.commit()
        
        return SignalRegisterResponse(
            message="Signal identity registered successfully",
            identity_public_key=id_pub_str,
            signing_public_key=sig_pub_str,
            signed_prekey_public=spk_pub_str
        )
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to register signal keys for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to register keys on the server"
        )

@router.get("/prekey-bundle/{user_id}", response_model=PreKeyBundleResponse)
async def get_prekey_bundle(
    user_id: str,
    db: AsyncSession = Depends(get_db)
):
    check_signal_enabled()
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user UUID format"
        )
        
    # Get identity keys
    stmt = select(SignalIdentity).where(SignalIdentity.user_id == user_uuid)
    res = await db.execute(stmt)
    identity = res.scalars().first()
    
    if not identity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signal identity keys not found for this user"
        )
        
    # Get one unused one-time prekey
    otp_stmt = select(OneTimePreKey).where(
        OneTimePreKey.user_id == user_uuid,
        OneTimePreKey.is_used == False
    ).limit(1)
    otp_res = await db.execute(otp_stmt)
    otp = otp_res.scalars().first()
    
    if otp:
        otp.is_used = True
        await db.commit()
    
    return PreKeyBundleResponse(
        identity_public_key=identity.identity_public_key,
        signing_public_key=identity.signing_public_key,
        signed_prekey_public=identity.signed_prekey_public,
        signed_prekey_signature=identity.signed_prekey_signature,
        one_time_prekey_public=otp.key_public if otp else None
    )

@router.post("/refresh-prekeys", response_model=RefreshPreKeysResponse)
async def refresh_prekeys(
    payload: RefreshPreKeysRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    check_signal_enabled()
    user_uuid = uuid.UUID(user_id)
    
    # Check if identity exists first
    stmt = select(SignalIdentity).where(SignalIdentity.user_id == user_uuid)
    res = await db.execute(stmt)
    identity = res.scalars().first()
    if not identity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Signal identity must be registered before refreshing prekeys"
        )
        
    try:
        count = payload.count
        otps = x3dh.generate_one_time_prekeys(count)
        for ot_priv, ot_pub in otps:
            ot_pub_str = identity_keys.serialize_public_key(ot_pub)
            ot_priv_enc = identity_keys.encrypt_private_key(ot_priv)
            otp_record = OneTimePreKey(
                user_id=user_uuid,
                key_public=ot_pub_str,
                key_private_encrypted=ot_priv_enc,
                is_used=False
            )
            db.add(otp_record)
            
        await db.commit()
        return RefreshPreKeysResponse(
            message="Prekeys refreshed successfully",
            added_count=count
        )
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to refresh prekeys for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to refresh prekeys on the server"
        )
