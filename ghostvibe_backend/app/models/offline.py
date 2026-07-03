import uuid
from sqlalchemy import String, Text, ForeignKey, DateTime, Index, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.database.base_class import Base

class OfflineMessage(Base):
    __tablename__ = "offline_messages"

    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False
    )
    recipient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    encrypted_payload: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )
    created_at: Mapped[func.now()] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True
    )

    __table_args__ = (
        Index("idx_recipient_created_at", "recipient_id", "created_at"),
    )

class OfflineCall(Base):
    __tablename__ = "offline_calls"

    call_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    caller_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False
    )
    recipient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    call_type: Mapped[str] = mapped_column(
        String(10),
        nullable=False
    )
    encrypted_signal_body: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )
    created_at: Mapped[func.now()] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True
    )

    __table_args__ = (
        CheckConstraint("call_type IN ('voice', 'video')", name="check_call_type"),
    )
