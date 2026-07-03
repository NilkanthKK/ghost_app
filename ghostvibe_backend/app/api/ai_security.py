from fastapi import APIRouter, HTTPException, status
from app.core.flags import flags
from app.core import ai_security_engine
from app.schemas.ai_security import (
    MessageMetadataRequest,
    CallAnalysisRequest,
    ImageAnalysisRequest,
    LinkVerificationRequest,
    QRVerificationRequest,
    FileVerificationRequest,
    SecurityRiskResponse
)

router = APIRouter(prefix="/v1/ai/security", tags=["AI Security Layer"])

def check_security_enabled():
    if not flags.AI_SECURITY_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="AI Security features are disabled on this server"
        )

@router.post("/message-analysis", response_model=SecurityRiskResponse)
async def message_analysis(payload: MessageMetadataRequest):
    check_security_enabled()
    res = ai_security_engine.analyze_message_metadata(
        send_frequency=payload.send_frequency,
        link_count=payload.link_count,
        message_length=payload.message_length,
        is_media=payload.is_media
    )
    return SecurityRiskResponse(**res)

@router.post("/call-analysis", response_model=SecurityRiskResponse)
async def call_analysis(payload: CallAnalysisRequest):
    check_security_enabled()
    res = ai_security_engine.analyze_call_stream(
        jitter_ms=payload.jitter_ms,
        packet_loss_pct=payload.packet_loss_pct,
        spectral_centroid_avg=payload.spectral_centroid_avg,
        deepfake_confidence=payload.deepfake_confidence
    )
    return SecurityRiskResponse(**res)

@router.post("/image-analysis", response_model=SecurityRiskResponse)
async def image_analysis(payload: ImageAnalysisRequest):
    check_security_enabled()
    res = ai_security_engine.analyze_image_attachment(
        file_size_bytes=payload.file_size_bytes,
        noise_variance=payload.noise_variance,
        tags=payload.tags
    )
    return SecurityRiskResponse(**res)

@router.post("/verify-link", response_model=SecurityRiskResponse)
async def verify_link(payload: LinkVerificationRequest):
    check_security_enabled()
    res = ai_security_engine.verify_link_risk(link=payload.link)
    return SecurityRiskResponse(**res)

@router.post("/verify-qr", response_model=SecurityRiskResponse)
async def verify_qr(payload: QRVerificationRequest):
    check_security_enabled()
    res = ai_security_engine.verify_qr_payload(qr_data=payload.qr_data)
    return SecurityRiskResponse(**res)

@router.post("/verify-file", response_model=SecurityRiskResponse)
async def verify_file(payload: FileVerificationRequest):
    check_security_enabled()
    res = ai_security_engine.verify_file_risk(
        filename=payload.filename,
        file_size_bytes=payload.file_size_bytes,
        extension=payload.extension,
        mime_type=payload.mime_type
    )
    return SecurityRiskResponse(**res)
