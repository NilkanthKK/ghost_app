from pydantic import BaseModel, Field
from typing import List

class DevicePairRequest(BaseModel):
    device_id: str
    device_name: str

class DevicePairResponse(BaseModel):
    pairing_session_id: str
    pairing_code: str

class DeviceApproveRequest(BaseModel):
    pairing_code: str

class DeviceApproveResponse(BaseModel):
    message: str
    device_id: str

class DeviceKeyRegisterRequest(BaseModel):
    device_id: str
    identity_public_key: str
    signed_prekey_public: str
    signed_prekey_signature: str
    one_time_prekeys_json: str

class DeviceListResponse(BaseModel):
    device_id: str
    device_name: str
    is_primary: bool
    approval_status: str
    linked_at: str

class SyncPushRequest(BaseModel):
    target_device_id: str
    payload_type: str
    encrypted_payload: str

class SyncPullResponse(BaseModel):
    packet_id: str
    payload_type: str
    encrypted_payload: str
    version_timestamp: str
