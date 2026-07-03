from pydantic import BaseModel, Field
from typing import Optional

class SignalRegisterResponse(BaseModel):
    message: str
    identity_public_key: str
    signing_public_key: str
    signed_prekey_public: str

class PreKeyBundleResponse(BaseModel):
    identity_public_key: str
    signing_public_key: str
    signed_prekey_public: str
    signed_prekey_signature: str
    one_time_prekey_public: Optional[str] = None

class RefreshPreKeysRequest(BaseModel):
    count: int = Field(default=100, ge=1, le=200)

class RefreshPreKeysResponse(BaseModel):
    message: str
    added_count: int
