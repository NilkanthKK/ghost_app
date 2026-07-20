import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from app.database.session import get_db
from app.core.security import decode_access_token
from app.core.flags import flags
from app.models.group_chat import Group, GroupMember, GroupInvite, GroupKey
from app.schemas.group_chat import (
    GroupCreateRequest,
    GroupCreateResponse,
    GroupInviteRequest,
    GroupRemoveRequest,
    GroupResponse,
    GroupMemberResponse
)
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/groups", tags=["E2EE Group Chats"])

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

def check_group_enabled():
    if not flags.GROUP_CHAT_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Group Chat feature is disabled on the server"
        )

# Group keys schemas
class GroupKeyDistributeItem(BaseModel):
    recipient_id: str
    sender_chain_key_encrypted: str
    sender_signature_key_public: str
    sender_signature_key_private_encrypted: str
    key_id: int = 0

class GroupKeyDistributeRequest(BaseModel):
    keys: List[GroupKeyDistributeItem]

class GroupKeyPullResponse(BaseModel):
    group_id: str
    sender_id: str
    sender_chain_key_encrypted: str
    sender_signature_key_public: str
    sender_signature_key_private_encrypted: str
    key_id: int

@router.post("/create", response_model=GroupCreateResponse)
async def create_group_chat(
    payload: GroupCreateRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    check_group_enabled()
    user_uuid = uuid.UUID(user_id)
    
    try:
        # Create group record
        group = Group(
            name=payload.name,
            avatar=payload.avatar,
            description=payload.description,
            created_by=user_uuid
        )
        db.add(group)
        await db.flush()  # populate group_id
        
        # Add creator as admin
        creator_member = GroupMember(
            group_id=group.group_id,
            user_id=user_uuid,
            role="admin"
        )
        db.add(creator_member)
        
        # Add initial members
        for m_id in payload.initial_members:
            m_uuid = uuid.UUID(m_id)
            if m_uuid == user_uuid:
                continue
            member = GroupMember(
                group_id=group.group_id,
                user_id=m_uuid,
                role="member"
            )
            db.add(member)
            
        await db.commit()
        logger.info(f"Group created: {group.group_id} by admin {user_id}")
        return GroupCreateResponse(
            group_id=str(group.group_id),
            name=group.name,
            message="Group created successfully"
        )
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to create group: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Group creation failed"
        )

@router.post("/{group_id}/invite", status_code=status.HTTP_200_OK)
async def invite_member(
    group_id: str,
    payload: GroupInviteRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    check_group_enabled()
    group_uuid = uuid.UUID(group_id)
    invitee_uuid = uuid.UUID(payload.invitee_id)
    user_uuid = uuid.UUID(user_id)
    
    # Verify inviter is in the group
    member_stmt = select(GroupMember).where(
        GroupMember.group_id == group_uuid,
        GroupMember.user_id == user_uuid
    )
    res = await db.execute(member_stmt)
    inviter_member = res.scalars().first()
    if not inviter_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only group members can invite others"
        )
        
    try:
        # Check if already in group
        existing_stmt = select(GroupMember).where(
            GroupMember.group_id == group_uuid,
            GroupMember.user_id == invitee_uuid
        )
        existing_res = await db.execute(existing_stmt)
        if existing_res.scalars().first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is already a member of this group"
            )
            
        # Check if already has a pending invite
        invite_stmt = select(GroupInvite).where(
            GroupInvite.group_id == group_uuid,
            GroupInvite.invitee_id == invitee_uuid,
            GroupInvite.status == "pending"
        )
        invite_res = await db.execute(invite_stmt)
        if invite_res.scalars().first():
            return {"message": "User already has a pending invitation to this group."}

        invite_record = GroupInvite(
            group_id=group_uuid,
            invitee_id=invitee_uuid,
            invited_by=user_uuid,
            status="pending"
        )
        db.add(invite_record)
        await db.commit()
        
        logger.info(f"User {payload.invitee_id} invited to group {group_id} by {user_id}")
        return {"message": "Invitation sent successfully"}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Invite failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Invite failed on server"
        )

@router.post("/{group_id}/remove", status_code=status.HTTP_200_OK)
async def remove_member(
    group_id: str,
    payload: GroupRemoveRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    check_group_enabled()
    group_uuid = uuid.UUID(group_id)
    user_uuid = uuid.UUID(user_id)
    remove_uuid = uuid.UUID(payload.member_id)
    
    # Verify current user is an admin of the group
    stmt = select(GroupMember).where(
        GroupMember.group_id == group_uuid,
        GroupMember.user_id == user_uuid
    )
    res = await db.execute(stmt)
    caller = res.scalars().first()
    if not caller or caller.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only group admins can remove members"
        )
        
    try:
        await db.execute(delete(GroupMember).where(
            GroupMember.group_id == group_uuid,
            GroupMember.user_id == remove_uuid
        ))
        # Clear sender keys of the removed member to prevent further access
        await db.execute(delete(GroupKey).where(
            GroupKey.group_id == group_uuid,
            GroupKey.sender_id == remove_uuid
        ))
        await db.commit()
        
        logger.info(f"User {payload.member_id} kicked from group {group_id} by admin {user_id}")
        return {"message": "Member removed successfully"}
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to remove member: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Remove transaction failed"
        )

@router.post("/{group_id}/leave", status_code=status.HTTP_200_OK)
async def leave_group(
    group_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    check_group_enabled()
    group_uuid = uuid.UUID(group_id)
    user_uuid = uuid.UUID(user_id)
    
    try:
        # Check membership and role
        stmt = select(GroupMember).where(
            GroupMember.group_id == group_uuid,
            GroupMember.user_id == user_uuid
        )
        res = await db.execute(stmt)
        member = res.scalars().first()
        if not member:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User is not a member of this group"
            )
            
        is_admin = (member.role == "admin")
        await db.delete(member)
        
        # Clear keys for leaving member
        await db.execute(delete(GroupKey).where(
            GroupKey.group_id == group_uuid,
            GroupKey.sender_id == user_uuid
        ))
        
        # If admin left, delegate admin role to the next oldest member
        if is_admin:
            next_stmt = select(GroupMember).where(
                GroupMember.group_id == group_uuid
            ).order_by(GroupMember.joined_at.asc()).limit(1)
            next_res = await db.execute(next_stmt)
            next_member = next_res.scalars().first()
            if next_member:
                next_member.role = "admin"
                
        await db.commit()
        logger.info(f"User {user_id} left group {group_id}")
        return {"message": "You left the group successfully"}
    except Exception as e:
        await db.rollback()
        logger.error(f"Leave failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Transaction failed"
        )

class GroupInviteResponse(BaseModel):
    invite_id: int
    group_id: str
    group_name: str
    invited_by_phone: str
    invited_by_username: str
    created_at: str

@router.get("", response_model=List[GroupResponse])
async def list_my_groups(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    check_group_enabled()
    user_uuid = uuid.UUID(user_id)
    
    # Find all groups where the user is a member
    stmt = select(GroupMember.group_id).where(GroupMember.user_id == user_uuid)
    res = await db.execute(stmt)
    group_ids = res.scalars().all()
    
    groups_list = []
    for g_id in group_ids:
        # get details
        g_stmt = select(Group).where(Group.group_id == g_id)
        g_res = await db.execute(g_stmt)
        group = g_res.scalars().first()
        if group:
            # get members
            m_stmt = select(GroupMember).where(GroupMember.group_id == g_id)
            m_res = await db.execute(m_stmt)
            members = m_res.scalars().all()
            
            groups_list.append(GroupResponse(
                group_id=str(group.group_id),
                name=group.name,
                avatar=group.avatar,
                description=group.description,
                created_by=str(group.created_by),
                created_at=group.created_at.isoformat(),
                members=[
                    GroupMemberResponse(
                        user_id=str(m.user_id),
                        role=m.role,
                        joined_at=m.joined_at.isoformat()
                    )
                    for m in members
                ]
            ))
    return groups_list

@router.get("/invites/pending", response_model=List[GroupInviteResponse])
async def get_pending_invites(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    check_group_enabled()
    user_uuid = uuid.UUID(user_id)
    
    stmt = select(GroupInvite).where(
        GroupInvite.invitee_id == user_uuid,
        GroupInvite.status == "pending"
    )
    res = await db.execute(stmt)
    invites = res.scalars().all()
    
    out = []
    for inv in invites:
        # Get group details
        g_stmt = select(Group).where(Group.group_id == inv.group_id)
        g_res = await db.execute(g_stmt)
        group = g_res.scalars().first()
        if not group:
            continue
        # Get inviter details
        u_stmt = select(User).where(User.user_id == inv.invited_by)
        u_res = await db.execute(u_stmt)
        inviter = u_res.scalars().first()
        inviter_phone = inviter.phone_number if inviter else "Unknown"
        inviter_name = inviter.username if inviter else "Unknown"
        
        out.append(GroupInviteResponse(
            invite_id=inv.id,
            group_id=str(inv.group_id),
            group_name=group.name,
            invited_by_phone=inviter_phone,
            invited_by_username=inviter_name,
            created_at=inv.created_at.isoformat()
        ))
    return out

@router.post("/invites/{invite_id}/accept", status_code=status.HTTP_200_OK)
async def accept_group_invite(
    invite_id: int,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    check_group_enabled()
    user_uuid = uuid.UUID(user_id)
    
    stmt = select(GroupInvite).where(
        GroupInvite.id == invite_id,
        GroupInvite.invitee_id == user_uuid,
        GroupInvite.status == "pending"
    )
    res = await db.execute(stmt)
    invite = res.scalars().first()
    if not invite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invite not found or already processed"
        )
        
    try:
        invite.status = "accepted"
        
        # Check if already a member
        member_stmt = select(GroupMember).where(
            GroupMember.group_id == invite.group_id,
            GroupMember.user_id == user_uuid
        )
        m_res = await db.execute(member_stmt)
        if not m_res.scalars().first():
            new_member = GroupMember(
                group_id=invite.group_id,
                user_id=user_uuid,
                role="member"
            )
            db.add(new_member)
        
        await db.commit()
        return {"message": "Group invite accepted"}
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to accept invite: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to accept group invite"
        )

@router.post("/invites/{invite_id}/decline", status_code=status.HTTP_200_OK)
async def decline_group_invite(
    invite_id: int,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    check_group_enabled()
    user_uuid = uuid.UUID(user_id)
    
    stmt = select(GroupInvite).where(
        GroupInvite.id == invite_id,
        GroupInvite.invitee_id == user_uuid,
        GroupInvite.status == "pending"
    )
    res = await db.execute(stmt)
    invite = res.scalars().first()
    if not invite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invite not found or already processed"
        )
        
    try:
        invite.status = "declined"
        await db.commit()
        return {"message": "Group invite declined"}
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to decline invite: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to decline group invite"
        )

@router.get("/{group_id}", response_model=GroupResponse)
async def get_group_details(
    group_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    check_group_enabled()
    group_uuid = uuid.UUID(group_id)
    user_uuid = uuid.UUID(user_id)
    
    # Verify caller is member
    member_stmt = select(GroupMember).where(
        GroupMember.group_id == group_uuid,
        GroupMember.user_id == user_uuid
    )
    res = await db.execute(member_stmt)
    if not res.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden access to group details"
        )
        
    group_stmt = select(Group).where(Group.group_id == group_uuid)
    group_res = await db.execute(group_stmt)
    group = group_res.scalars().first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
        
    members_stmt = select(GroupMember).where(GroupMember.group_id == group_uuid)
    members_res = await db.execute(members_stmt)
    members = members_res.scalars().all()
    
    return GroupResponse(
        group_id=str(group.group_id),
        name=group.name,
        avatar=group.avatar,
        description=group.description,
        created_by=str(group.created_by),
        created_at=group.created_at.isoformat(),
        members=[
            GroupMemberResponse(
                user_id=str(m.user_id),
                role=m.role,
                joined_at=m.joined_at.isoformat()
            )
            for m in members
        ]
    )

@router.post("/{group_id}/keys/distribute", status_code=status.HTTP_200_OK)
async def distribute_group_keys(
    group_id: str,
    payload: GroupKeyDistributeRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    check_group_enabled()
    group_uuid = uuid.UUID(group_id)
    user_uuid = uuid.UUID(user_id)
    
    try:
        for k in payload.keys:
            rec_uuid = uuid.UUID(k.recipient_id)
            
            # Upsert GroupKey record
            stmt = select(GroupKey).where(
                GroupKey.group_id == group_uuid,
                GroupKey.sender_id == user_uuid,
                GroupKey.recipient_id == rec_uuid
            )
            res = await db.execute(stmt)
            gk = res.scalars().first()
            
            if gk:
                gk.sender_chain_key_encrypted = k.sender_chain_key_encrypted
                gk.sender_signature_key_public = k.sender_signature_key_public
                gk.sender_signature_key_private_encrypted = k.sender_signature_key_private_encrypted
                gk.key_id = k.key_id
            else:
                gk = GroupKey(
                    group_id=group_uuid,
                    sender_id=user_uuid,
                    recipient_id=rec_uuid,
                    sender_chain_key_encrypted=k.sender_chain_key_encrypted,
                    sender_signature_key_public=k.sender_signature_key_public,
                    sender_signature_key_private_encrypted=k.sender_signature_key_private_encrypted,
                    key_id=k.key_id
                )
                db.add(gk)
        await db.commit()
        return {"message": "Sender keys distributed successfully"}
    except Exception as e:
        await db.rollback()
        logger.error(f"Distribute keys failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Transaction failed"
        )

@router.get("/{group_id}/keys/pull", response_model=List[GroupKeyPullResponse])
async def pull_group_keys(
    group_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    check_group_enabled()
    group_uuid = uuid.UUID(group_id)
    user_uuid = uuid.UUID(user_id)
    
    # Query all Sender Keys uploaded for this recipient in this group
    stmt = select(GroupKey).where(
        GroupKey.group_id == group_uuid,
        GroupKey.recipient_id == user_uuid
    )
    res = await db.execute(stmt)
    keys = res.scalars().all()
    
    return [
        GroupKeyPullResponse(
            group_id=str(k.group_id),
            sender_id=str(k.sender_id),
            sender_chain_key_encrypted=k.sender_chain_key_encrypted,
            sender_signature_key_public=k.sender_signature_key_public,
            sender_signature_key_private_encrypted=k.sender_signature_key_private_encrypted,
            key_id=k.key_id
        )
        for k in keys
    ]
