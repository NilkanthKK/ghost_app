from pydantic import BaseModel, Field
from typing import Optional, List

class MessageMetadataRequest(BaseModel):
    send_frequency: float = Field(..., ge=0.0)
    link_count: int = Field(..., ge=0)
    message_length: int = Field(..., ge=0)
    is_media: bool

class CallAnalysisRequest(BaseModel):
    jitter_ms: float = Field(..., ge=0.0)
    packet_loss_pct: float = Field(..., ge=0.0, le=100.0)
    spectral_centroid_avg: float = Field(..., ge=0.0)
    deepfake_confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)

class ImageAnalysisRequest(BaseModel):
    file_size_bytes: int = Field(..., ge=0)
    noise_variance: float = Field(..., ge=0.0)
    tags: List[str] = Field(default_factory=list)

class LinkVerificationRequest(BaseModel):
    link: str

class QRVerificationRequest(BaseModel):
    qr_data: str

class FileVerificationRequest(BaseModel):
    filename: str
    file_size_bytes: int = Field(..., ge=0)
    extension: str
    mime_type: str

class SecurityRiskResponse(BaseModel):
    risk_score: float
    confidence_score: float
    severity: str
    recommendations: List[str]
    details: dict
