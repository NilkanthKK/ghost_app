import os

class FeatureFlags:
    OFFLINE_QUEUE_ENABLED: bool = os.getenv("OFFLINE_QUEUE_ENABLED", "true").lower() == "true"
    DOUBLE_RATCHET_ENABLED: bool = os.getenv("DOUBLE_RATCHET_ENABLED", "false").lower() == "true"
    GROUP_CHAT_ENABLED: bool = os.getenv("GROUP_CHAT_ENABLED", "true").lower() == "true"
    MULTI_DEVICE_ENABLED: bool = os.getenv("MULTI_DEVICE_ENABLED", "false").lower() == "true"
    CHAT_LOCK_ENABLED: bool = os.getenv("CHAT_LOCK_ENABLED", "false").lower() == "true"
    VIEW_ONCE_ENABLED: bool = os.getenv("VIEW_ONCE_ENABLED", "false").lower() == "true"
    DISAPPEARING_MESSAGES_ENABLED: bool = os.getenv("DISAPPEARING_MESSAGES_ENABLED", "false").lower() == "true"
    AI_SECURITY_ENABLED: bool = os.getenv("AI_SECURITY_ENABLED", "true").lower() == "true"
    CALL_HISTORY_ENABLED: bool = os.getenv("CALL_HISTORY_ENABLED", "true").lower() == "true"
    LIVE_SUBTITLE_ENABLED: bool = os.getenv("LIVE_SUBTITLE_ENABLED", "true").lower() == "true"
    SIGNAL_PROTOCOL_ENABLED: bool = os.getenv("SIGNAL_PROTOCOL_ENABLED", "true").lower() == "true"

flags = FeatureFlags()
