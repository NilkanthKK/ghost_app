from pydantic import BaseModel, field_validator
from typing import Optional, List
import re
import uuid
from app.core.validators import sanitize_text

class GroupCreateRequest(BaseModel):
    name: str
    avatar: Optional[str] = None
    description: Optional[str] = None
    initial_members: List[str] = []

    @field_validator('name')
    @classmethod
    def check_group_name(cls, v):
        sanitized = sanitize_text(v)
        if len(sanitized) < 3 or len(sanitized) > 30:
            raise ValueError("Group name must be between 3 and 30 characters.")
        if "  " in v:
            raise ValueError("Group name cannot contain consecutive spaces.")
        # Allow alphanumeric, spaces, dashes, dots, underscores
        if not re.match(r"^[a-zA-Z0-9_\-\.\s]+$", sanitized):
            raise ValueError("Group name contains invalid characters.")
        return sanitized

    @field_validator('description')
    @classmethod
    def check_description(cls, v):
        if not v:
            return ""
        sanitized = sanitize_text(v)
        if len(sanitized) > 150:
            raise ValueError("Group description must not exceed 150 characters.")
        return sanitized

    @field_validator('initial_members')
    @classmethod
    def check_members(cls, v):
        # Verify that all member IDs are valid UUIDs
        for m_id in v:
            try:
                uuid.UUID(m_id)
            except ValueError:
                raise ValueError(f"Invalid member user_id: {m_id}")
        return v

class GroupCreateResponse(BaseModel):
    group_id: str
    name: str
    message: str

class GroupInviteRequest(BaseModel):
    invitee_id: str

    @field_validator('invitee_id')
    @classmethod
    def check_invitee_id(cls, v):
        try:
            uuid.UUID(v)
        except ValueError:
            raise ValueError("invitee_id must be a valid UUID string.")
        return v

class GroupRemoveRequest(BaseModel):
    member_id: str

    @field_validator('member_id')
    @classmethod
    def check_member_id(cls, v):
        try:
            uuid.UUID(v)
        except ValueError:
            raise ValueError("member_id must be a valid UUID string.")
        return v

class GroupMemberResponse(BaseModel):
    user_id: str
    role: str
    joined_at: str

class GroupResponse(BaseModel):
    group_id: str
    name: str
    avatar: Optional[str]
    description: Optional[str]
    created_by: str
    created_at: str
    members: List[GroupMemberResponse]
