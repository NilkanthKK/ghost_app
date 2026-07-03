from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional
import uuid
import re
from datetime import datetime

class UserPreferenceRequest(BaseModel):
    encrypted_prefs: str = Field(..., min_length=1, description="Client-encrypted preferences payload")
    username: Optional[str] = None
    full_name: Optional[str] = None
    email: Optional[str] = None

    @field_validator('encrypted_prefs')
    @classmethod
    def check_encrypted_prefs(cls, v):
        if not re.match(r"^ENC\[[A-Za-z0-9+/=]+\]$", v):
            raise ValueError("Preferences must be encrypted and formatted as ENC[base64_payload]")
        return v

class UserPreferenceResponse(BaseModel):
    user_id: uuid.UUID
    updated_at: datetime
    message: str

    model_config = ConfigDict(from_attributes=True)
