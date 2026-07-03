import uuid
from datetime import datetime
from sqlalchemy import String, ForeignKey, DateTime, Boolean, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.database.base_class import Base
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from app.models.user import User

class LinkedDevice(Base):
    __tablename__ = "linked_devices"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    device_id: Mapped[str] = mapped_column(
        String,
        nullable=False,
        index=True
    )
    device_name: Mapped[str] = mapped_column(
        String,
        nullable=False
    )
    is_primary: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False
    )
    approval_status: Mapped[str] = mapped_column(
        String,
        default="pending",  # pending, approved, revoked
        nullable=False
    )
    linked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    user: Mapped["User"] = relationship("User", lazy="selectin")

class DeviceSession(Base):
    __tablename__ = "device_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    device_id: Mapped[str] = mapped_column(
        String,
        nullable=False,
        index=True
    )
    auth_token: Mapped[str] = mapped_column(
        String,
        nullable=False
    )
    last_active: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    user: Mapped["User"] = relationship("User", lazy="selectin")

class DeviceKey(Base):
    __tablename__ = "device_keys"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    device_id: Mapped[str] = mapped_column(
        String,
        nullable=False,
        index=True
    )
    identity_public_key: Mapped[str] = mapped_column(
        String,
        nullable=False
    )
    signed_prekey_public: Mapped[str] = mapped_column(
        String,
        nullable=False
    )
    signed_prekey_signature: Mapped[str] = mapped_column(
        String,
        nullable=False
    )
    one_time_prekeys_json: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )

    user: Mapped["User"] = relationship("User", lazy="selectin")

class DeviceSyncPacket(Base):
    """
    Stores incremental encrypted sync packets intended for secondary devices.
    """
    __tablename__ = "device_sync_packets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    target_device_id: Mapped[str] = mapped_column(
        String,
        nullable=False,
        index=True
    )
    payload_type: Mapped[str] = mapped_column(
        String,
        nullable=False  # session-sync, key-sync, preference-sync, message-sync, read-status-sync
    )
    encrypted_payload: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )
    version_timestamp: Mapped[float] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
