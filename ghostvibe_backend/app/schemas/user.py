from pydantic import BaseModel, ConfigDict
import uuid
from typing import List

class UserBase(BaseModel):
    pass

class UserCreate(BaseModel):
    phone_number: str
    identity_key_public: str
    pre_keys: List[str]  # Ephemeral pre-keys to be registered alongside the user

class UserResponse(BaseModel):
    user_id: uuid.UUID
    username_hash: str
    identity_key_public: str

    model_config = ConfigDict(from_attributes=True)
