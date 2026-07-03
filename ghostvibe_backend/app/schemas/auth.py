from pydantic import BaseModel, ConfigDict, field_validator
import uuid
from typing import Optional, List
from app.core.validators import validate_phone_number, validate_otp_code

class Token(BaseModel):
    access_token: str
    token_type: str
    user_id: uuid.UUID

class TokenPayload(BaseModel):
    sub: Optional[str] = None

class OTPTrigger(BaseModel):
    phone_number: str

    @field_validator('phone_number')
    @classmethod
    def check_phone(cls, v):
        return validate_phone_number(v)

class OTPVerify(BaseModel):
    phone_number: str
    otp_code: str
    identity_key_public: str
    pre_keys: List[str]
    register_only: Optional[bool] = False

    @field_validator('phone_number')
    @classmethod
    def check_phone(cls, v):
        return validate_phone_number(v)

    @field_validator('otp_code')
    @classmethod
    def check_otp(cls, v):
        return validate_otp_code(v)

class PreKeyBundle(BaseModel):
    user_id: uuid.UUID
    username_hash: str
    identity_key_public: str
    one_time_pre_key: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
