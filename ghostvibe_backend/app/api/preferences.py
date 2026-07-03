import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database.session import get_db
from app.models.preferences import UserPreference
from app.models.user import User
from app.schemas.preferences import UserPreferenceRequest, UserPreferenceResponse
from app.core.security import decode_access_token
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/user/preferences", tags=["User Preferences"])

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

@router.post("", response_model=UserPreferenceResponse)
async def save_user_preferences(
    payload: UserPreferenceRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Saves or updates the client-encrypted preferences blob for the authenticated user.
    Server acts purely as an opaque, zero-knowledge storage unit.
    """
    user_uuid = uuid.UUID(user_id)
    
    try:
        # Sync plain text fields to user record for admin dashboard visibility
        if payload.username is not None or payload.full_name is not None or payload.email is not None:
            user_stmt = select(User).where(User.user_id == user_uuid)
            user_res = await db.execute(user_stmt)
            user_obj = user_res.scalars().first()
            if user_obj:
                if payload.username is not None:
                    user_obj.username = payload.username
                if payload.full_name is not None:
                    user_obj.full_name = payload.full_name
                if payload.email is not None:
                    user_obj.email = payload.email
                db.add(user_obj)
        
        # Check if preferences record exists
        stmt = select(UserPreference).where(UserPreference.user_id == user_uuid)
        result = await db.execute(stmt)
        pref_record = result.scalars().first()
        
        if pref_record:
            # Update existing record
            pref_record.encrypted_prefs = payload.encrypted_prefs
            logger.info(f"Updated preferences for user: {user_id}")
        else:
            # Create new record
            pref_record = UserPreference(
                user_id=user_uuid,
                encrypted_prefs=payload.encrypted_prefs
            )
            db.add(pref_record)
            logger.info(f"Created new preferences record for user: {user_id}")
            
        await db.commit()
        await db.refresh(pref_record)
        
        return UserPreferenceResponse(
            user_id=pref_record.user_id,
            updated_at=pref_record.updated_at,
            message="Preferences synchronized successfully"
        )
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to synchronize preferences for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save preferences on the server"
        )

@router.get("", response_model=UserPreferenceRequest)
async def get_user_preferences(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieves the client-encrypted preferences blob for the authenticated user.
    """
    user_uuid = uuid.UUID(user_id)
    
    stmt = select(UserPreference).where(UserPreference.user_id == user_uuid)
    result = await db.execute(stmt)
    pref_record = result.scalars().first()
    
    if not pref_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Preferences record not found for this user"
        )
        
    return UserPreferenceRequest(
        encrypted_prefs=pref_record.encrypted_prefs
    )
