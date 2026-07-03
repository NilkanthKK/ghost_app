from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid

class AdminLoginRequest(BaseModel):
    email: str = Field(..., description="Admin login email")
    password: str = Field(..., description="Admin login password")

class AdminTokenResponse(BaseModel):
    access_token: str
    token_type: str
    email: str
    role: str

class DashboardStatsResponse(BaseModel):
    total_users: int
    active_users: int
    online_users: int
    offline_users: int
    new_users_today: int
    new_users_this_week: int
    new_users_this_month: int
    verified_users: int
    blocked_users: int
    total_messages: int
    messages_today: int
    groups: int
    stories: int
    calls: int
    storage_usage_bytes: int
    devices_connected: int
    api_health: str
    database_health: str
    websocket_health: str
    queue_health: str
    cpu_usage_percent: float
    ram_usage_percent: float
    disk_usage_percent: float
    server_uptime_seconds: int
    chart_data: Dict[str, Any]

class UserResponseAdmin(BaseModel):
    user_id: uuid.UUID
    username_hash: str
    username: Optional[str] = None
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    bio: Optional[str] = None
    avatar: Optional[str] = None
    role: str = "user"
    registration_date: datetime
    last_login: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    online_status: bool = False
    device_count: int = 0
    story_count: int = 0
    group_count: int = 0
    message_count: int = 0
    media_count: int = 0
    country: str = "Unknown"
    verification_status: str = "verified"
    is_blocked: bool = False
    is_suspended: bool = False

class PaginatedUsersResponse(BaseModel):
    total: int
    page: int
    size: int
    users: List[UserResponseAdmin]

class UserActionRequest(BaseModel):
    action: str = Field(..., description="Action: block, unblock, suspend, unsuspend, delete, restore, force_logout, reset_pin")

class BroadcastRequest(BaseModel):
    type: str = Field(..., description="Type: message, notification, maintenance, logout, alert")
    title: str = Field(..., description="Title of the broadcast")
    content: str = Field(..., description="Message/Notice content")

class AuditLogResponse(BaseModel):
    log_id: uuid.UUID
    admin_email: str
    action: str
    target_user_id: Optional[str]
    timestamp: datetime
    ip_address: Optional[str]
    device: Optional[str]
    old_value: Optional[str]
    new_value: Optional[str]

class AdminSettingsRequest(BaseModel):
    feature_flags: Dict[str, bool]
    file_limits: Dict[str, int]
    allowed_countries: List[str]
