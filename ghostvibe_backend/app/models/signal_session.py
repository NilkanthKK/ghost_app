import uuid
from datetime import datetime
from sqlalchemy import String, ForeignKey, DateTime, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.database.base_class import Base
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from app.models.user import User

class SignalSession(Base):
    __tablename__ = "signal_sessions"

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    local_user: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    remote_user: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    # Encrypted root/chain keys
    root_key: Mapped[str] = mapped_column(
        String,
        nullable=False
    )
    sending_chain: Mapped[Optional[str]] = mapped_column(
        String,
        nullable=True
    )
    receiving_chain: Mapped[Optional[str]] = mapped_column(
        String,
        nullable=True
    )
    # Encrypted local DH private key + unencrypted local DH public key (Base64 combined JSON)
    dh_pair: Mapped[str] = mapped_column(
        String,
        nullable=False
    )
    remote_dh_public: Mapped[Optional[str]] = mapped_column(
        String,
        nullable=True
    )
    previous_chain_length: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False
    )
    send_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False
    )
    receive_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False
    )
    # JSON-encoded string mapping Skipped keys -> encrypted message keys
    skipped_keys_json: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )
