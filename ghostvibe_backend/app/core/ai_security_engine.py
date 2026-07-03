import re
from typing import Optional, List

def compute_risk_rating(risk_score: float) -> tuple[str, list[str]]:
    """
    Translates a 0-100 risk score to a severity and recommendations.
    """
    if risk_score >= 80:
        return "critical", [
            "Terminate active session/connection immediately.",
            "Do not download, click, or open any shared links or files.",
            "Report and block the sender profile."
        ]
    elif risk_score >= 50:
        return "high", [
            "Exercise extreme caution with this peer.",
            "Verify the identity of the user via an out-of-band channel.",
            "Do not input passwords or personal information."
        ]
    elif risk_score >= 25:
        return "medium", [
            "Be aware of suspicious message metadata patterns.",
            "Avoid clicking links from untrusted sources."
        ]
    else:
        return "low", [
            "No immediate risk detected.",
            "Standard security protocols active."
        ]

def analyze_message_metadata(
    send_frequency: float,
    link_count: int,
    message_length: int,
    is_media: bool
) -> dict:
    """
    Analyzes message transmission patterns without decrypting the E2EE body.
    """
    spam_score = 0.0
    scam_score = 0.0
    confidence = 85.0

    # Spam pattern detection based on frequency and size
    if send_frequency > 60:  # More than 1 msg per second
        spam_score += 70.0
    elif send_frequency > 30:
        spam_score += 40.0

    if message_length > 3000 and send_frequency > 15:
        spam_score += 20.0

    # Scam pattern detection based on links
    if link_count > 3:
        scam_score += 80.0
    elif link_count > 1:
        scam_score += 35.0

    risk_score = max(spam_score, scam_score)
    severity, recs = compute_risk_rating(risk_score)

    return {
        "risk_score": risk_score,
        "confidence_score": confidence,
        "severity": severity,
        "recommendations": recs,
        "details": {
            "spam_indicator": spam_score,
            "scam_indicator": scam_score
        }
    }

def analyze_call_stream(
    jitter_ms: float,
    packet_loss_pct: float,
    spectral_centroid_avg: float,
    deepfake_confidence: Optional[float] = None
) -> dict:
    """
    Evaluates real-time audio streams for voice cloning or deepfake speech anomalies.
    """
    spoof_score = 0.0
    confidence = 90.0

    # Voice clone signature detection via spectral centroids
    # Human voice centroid normally sits between 500Hz and 3000Hz.
    # Anomalously narrow/static or broad centroids indicate cloned audio artifacts.
    if spectral_centroid_avg < 150 or spectral_centroid_avg > 4500:
        spoof_score += 65.0
    elif spectral_centroid_avg < 300 or spectral_centroid_avg > 3800:
        spoof_score += 30.0

    # Deepfake model artifacts (represented by jitter fluctuations decoupled from network loss)
    if jitter_ms > 45 and packet_loss_pct < 1.0:
        spoof_score += 40.0

    # Direct ML classifier input override if available
    if deepfake_confidence is not None:
        spoof_score = max(spoof_score, deepfake_confidence * 100)

    risk_score = min(100.0, spoof_score)
    severity, recs = compute_risk_rating(risk_score)

    return {
        "risk_score": risk_score,
        "confidence_score": confidence,
        "severity": severity,
        "recommendations": recs,
        "details": {
            "voice_clone_probability": spoof_score,
            "deepfake_confidence": deepfake_confidence or (spoof_score / 100.0)
        }
    }

def analyze_image_attachment(
    file_size_bytes: int,
    noise_variance: float,
    tags: List[str]
) -> dict:
    """
    Evaluates images for NSFW, fake images, and AI-generated content.
    """
    nsfw_score = 0.0
    fake_score = 0.0
    confidence = 88.0

    # AI Generated Image indicators (AI engines often yield super-smooth noise variances)
    if noise_variance < 0.0005:
        fake_score += 75.0
    elif noise_variance < 0.002:
        fake_score += 35.0

    # Parse metadata tags
    tags_lower = [t.lower() for t in tags]
    if "nsfw" in tags_lower or "adult" in tags_lower:
        nsfw_score += 95.0
    if "synthetic" in tags_lower or "stable-diffusion" in tags_lower or "midjourney" in tags_lower:
        fake_score = max(fake_score, 90.0)

    risk_score = max(nsfw_score, fake_score)
    severity, recs = compute_risk_rating(risk_score)

    return {
        "risk_score": risk_score,
        "confidence_score": confidence,
        "severity": severity,
        "recommendations": recs,
        "details": {
            "nsfw_probability": nsfw_score,
            "ai_generated_probability": fake_score
        }
    }

def verify_link_risk(link: str) -> dict:
    """
    Validates URL risk bounds.
    """
    risk_score = 0.0
    confidence = 95.0
    
    suspicious_keywords = ["login", "secure", "bank", "free", "gift", "crypto", "verify", "update-account"]
    malicious_tlds = [".zip", ".exe", ".click", ".gq", ".cf", ".tk", ".ml"]

    link_lower = link.lower()
    
    # Check keywords
    for keyword in suspicious_keywords:
        if keyword in link_lower:
            risk_score += 25.0
            
    # Check suspicious TLDs
    for tld in malicious_tlds:
        if link_lower.endswith(tld) or f"{tld}/" in link_lower:
            risk_score += 50.0

    risk_score = min(100.0, risk_score)
    severity, recs = compute_risk_rating(risk_score)

    return {
        "risk_score": risk_score,
        "confidence_score": confidence,
        "severity": severity,
        "recommendations": recs,
        "details": {
            "flagged_keywords": [kw for kw in suspicious_keywords if kw in link_lower],
            "unsafe_tld": any(link_lower.endswith(t) or f"{t}/" in link_lower for t in malicious_tlds)
        }
    }

def verify_qr_payload(qr_data: str) -> dict:
    """
    Analyzes scanned QR codes for links, commands or script payloads.
    """
    risk_score = 0.0
    confidence = 92.0

    # Shell commands or script triggers
    command_patterns = [r"\bsh\b", r"\bcmd\b", r"\bpowershell\b", r"\bbash\b", r"rm -rf"]
    for pattern in command_patterns:
        if re.search(pattern, qr_data, re.IGNORECASE):
            risk_score += 85.0

    # Embedded url redirect check
    if "http://" in qr_data.lower() or "https://" in qr_data.lower():
        # Delegate to url verify
        url_match = re.search(r"https?://[^\s]+", qr_data, re.IGNORECASE)
        if url_match:
            url_res = verify_link_risk(url_match.group(0))
            risk_score = max(risk_score, url_res["risk_score"])

    risk_score = min(100.0, risk_score)
    severity, recs = compute_risk_rating(risk_score)

    return {
        "risk_score": risk_score,
        "confidence_score": confidence,
        "severity": severity,
        "recommendations": recs,
        "details": {
            "contains_commands": any(re.search(p, qr_data, re.IGNORECASE) for p in command_patterns)
        }
    }

def verify_file_risk(
    filename: str,
    file_size_bytes: int,
    extension: str,
    mime_type: str
) -> dict:
    """
    Evaluates uploaded file structures for malware or executable code injections.
    """
    risk_score = 0.0
    confidence = 96.0

    malicious_extensions = [".exe", ".scr", ".bat", ".cmd", ".vbs", ".sh", ".js", ".msi"]
    ext_lower = extension.lower()
    if not ext_lower.startswith('.'):
        ext_lower = f".{ext_lower}"

    # Double extension detection (e.g. photo.jpg.exe)
    parts = filename.lower().split('.')
    if len(parts) > 2:
        # Check if the final or penultimate extensions are executable
        if any(f".{p}" in malicious_extensions for p in parts[1:]):
            risk_score += 90.0

    # Standard executable extension check
    if ext_lower in malicious_extensions:
        risk_score = max(risk_score, 85.0)

    # Executable MIME type check
    if "application/x-msdownload" in mime_type or "application/octet-stream" in mime_type:
        if ext_lower in malicious_extensions:
            risk_score = max(risk_score, 95.0)

    # Size-based anomalies (e.g., tiny executables < 1KB often indicate script shells)
    if ext_lower in malicious_extensions and file_size_bytes < 1024:
        risk_score = max(risk_score, 98.0)

    risk_score = min(100.0, risk_score)
    severity, recs = compute_risk_rating(risk_score)

    return {
        "risk_score": risk_score,
        "confidence_score": confidence,
        "severity": severity,
        "recommendations": recs,
        "details": {
            "is_double_extension": len(parts) > 2,
            "is_malicious_extension": ext_lower in malicious_extensions
        }
    }
