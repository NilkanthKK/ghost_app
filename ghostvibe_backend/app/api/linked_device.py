import uuid
import secrets
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.database.session import get_db
from app.core.security import decode_access_token
from app.models.linked_device import LinkedDevice, DeviceSession, DeviceKey, DeviceSyncPacket
from app.schemas.linked_device import (
    DevicePairRequest,
    DevicePairResponse,
    DeviceApproveRequest,
    DeviceApproveResponse,
    DeviceKeyRegisterRequest,
    DeviceListResponse,
    SyncPushRequest,
    SyncPullResponse
)
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/devices", tags=["Multi-Device Sync"])

security = HTTPBearer()

async def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    token = credentials.credentials
    user_id = decode_access_token(token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token or expired session"
        )
    return user_id

@router.post("/pair/request", response_model=DevicePairResponse)
async def request_device_pairing(
    payload: DevicePairRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    user_uuid = uuid.UUID(user_id)
    pairing_session_id = str(uuid.uuid4())
    pairing_code = f"pair:{user_id}:{secrets.token_hex(8)}"

    try:
        # Create a pending LinkedDevice record
        device = LinkedDevice(
            user_id=user_uuid,
            device_id=payload.device_id,
            device_name=payload.device_name,
            is_primary=False,
            approval_status="pending"
        )
        db.add(device)
        await db.commit()

        logger.info(f"Pairing request created for user {user_id}, device {payload.device_id}")
        return DevicePairResponse(
            pairing_session_id=pairing_session_id,
            pairing_code=pairing_code
        )
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to create pairing request: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initiate pairing session"
        )

@router.post("/pair/approve", response_model=DeviceApproveResponse)
async def approve_device_pairing(
    payload: DeviceApproveRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    parts = payload.pairing_code.split(":")
    if len(parts) != 3 or parts[0] != "pair":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Malformed pairing code"
        )

    code_user_id = parts[1]
    if code_user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Pairing code does not match authenticated user"
        )

    user_uuid = uuid.UUID(user_id)
    try:
        # Find the latest pending device for this user
        stmt = select(LinkedDevice).where(
            LinkedDevice.user_id == user_uuid,
            LinkedDevice.approval_status == "pending"
        ).order_by(LinkedDevice.linked_at.desc()).limit(1)
        
        res = await db.execute(stmt)
        device = res.scalars().first()
        
        if not device:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No pending pairing requests found"
            )

        device.approval_status = "approved"
        await db.commit()

        logger.info(f"Approved device pairing: {device.device_id} for user {user_id}")
        return DeviceApproveResponse(
            message="Device approved successfully",
            device_id=device.device_id
        )
    except Exception as e:
        await db.rollback()
        logger.error(f"Approval failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Approval transaction failed"
        )

@router.post("/keys/register", status_code=status.HTTP_200_OK)
async def register_device_keys(
    payload: DeviceKeyRegisterRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    user_uuid = uuid.UUID(user_id)
    try:
        # Delete old key record if exists for this device
        stmt = select(DeviceKey).where(
            DeviceKey.user_id == user_uuid,
            DeviceKey.device_id == payload.device_id
        )
        res = await db.execute(stmt)
        old_key = res.scalars().first()
        if old_key:
            await db.delete(old_key)

        key_record = DeviceKey(
            user_id=user_uuid,
            device_id=payload.device_id,
            identity_public_key=payload.identity_public_key,
            signed_prekey_public=payload.signed_prekey_public,
            signed_prekey_signature=payload.signed_prekey_signature,
            one_time_prekeys_json=payload.one_time_prekeys_json
        )
        db.add(key_record)
        await db.commit()
        
        logger.info(f"Keys registered for device {payload.device_id} (User: {user_id})")
        return {"message": "Keys registered successfully"}
    except Exception as e:
        await db.rollback()
        logger.error(f"Keys registration failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Keys transaction failed"
        )

@router.get("/list", response_model=List[DeviceListResponse])
async def list_linked_devices(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    user_uuid = uuid.UUID(user_id)
    stmt = select(LinkedDevice).where(LinkedDevice.user_id == user_uuid)
    res = await db.execute(stmt)
    devices = res.scalars().all()
    
    return [
        DeviceListResponse(
            device_id=d.device_id,
            device_name=d.device_name,
            is_primary=d.is_primary,
            approval_status=d.approval_status,
            linked_at=d.linked_at.isoformat()
        )
        for d in devices
    ]

@router.delete("/{device_id}", status_code=status.HTTP_200_OK)
async def revoke_linked_device(
    device_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    user_uuid = uuid.UUID(user_id)
    try:
        # 1. Delete from LinkedDevice table
        await db.execute(delete(LinkedDevice).where(
            LinkedDevice.user_id == user_uuid,
            LinkedDevice.device_id == device_id
        ))
        
        # 2. Delete from DeviceSession
        await db.execute(delete(DeviceSession).where(
            DeviceSession.user_id == user_uuid,
            DeviceSession.device_id == device_id
        ))

        # 3. Delete from DeviceKey
        await db.execute(delete(DeviceKey).where(
            DeviceKey.user_id == user_uuid,
            DeviceKey.device_id == device_id
        ))

        await db.commit()
        logger.info(f"Revoked linked device {device_id} for user {user_id}")
        return {"message": "Device revoked successfully"}
    except Exception as e:
        await db.rollback()
        logger.error(f"Revocation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Revocation transaction failed"
        )

@router.post("/sync/push", status_code=status.HTTP_200_OK)
async def push_sync_packet(
    payload: SyncPushRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    user_uuid = uuid.UUID(user_id)
    try:
        sync_packet = DeviceSyncPacket(
            user_id=user_uuid,
            target_device_id=payload.target_device_id,
            payload_type=payload.payload_type,
            encrypted_payload=payload.encrypted_payload
        )
        db.add(sync_packet)
        await db.commit()
        
        logger.info(f"Sync packet pushed to device {payload.target_device_id} (Type: {payload.payload_type})")
        return {"message": "Sync packet queued"}
    except Exception as e:
        await db.rollback()
        logger.error(f"Sync push failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Sync push transaction failed"
        )

@router.get("/sync/pull", response_model=List[SyncPullResponse])
async def pull_sync_packets(
    device_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    user_uuid = uuid.UUID(user_id)
    try:
        stmt = select(DeviceSyncPacket).where(
            DeviceSyncPacket.user_id == user_uuid,
            DeviceSyncPacket.target_device_id == device_id
        ).order_by(DeviceSyncPacket.version_timestamp.asc())
        
        res = await db.execute(stmt)
        packets = res.scalars().all()
        
        response = [
            SyncPullResponse(
                packet_id=str(p.id),
                payload_type=p.payload_type,
                encrypted_payload=p.encrypted_payload,
                version_timestamp=p.version_timestamp.isoformat()
            )
            for p in packets
        ]
        
        # Prune packets from database upon pull (standard queue delivery receipt logic)
        for p in packets:
            await db.delete(p)
        await db.commit()
        
        return response
    except Exception as e:
        await db.rollback()
        logger.error(f"Sync pull failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Sync pull transaction failed"
        )
