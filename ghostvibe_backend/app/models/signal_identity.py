import uuid
from datetime import datetime
from sqlalchemy import String, ForeignKey, DateTime, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.database.base_class import Base
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.user import User

class SignalIdentity(Base):
    __tablename__ = "signal_identities"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        primary_key=True
    )
    identity_public_key: Mapped[str] = mapped_column(
        String,
        nullable=False
    )
    identity_private_key_encrypted: Mapped[str] = mapped_column(
        String,
        nullable=False
    )
    signing_public_key: Mapped[str] = mapped_column(
        String,
        nullable=False
    )
    signing_private_key_encrypted: Mapped[str] = mapped_column(
        String,
        nullable=False
    )
    signed_prekey_public: Mapped[str] = mapped_column(
        String,
        nullable=False
    )
    signed_prekey_private_encrypted: Mapped[str] = mapped_column(
        String,
        nullable=False
    )
    signed_prekey_signature: Mapped[str] = mapped_column(
        String,
        nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        index=True
    )

    # Relationship
    user: Mapped["User"] = relationship(
        "User",
        lazy="selectin"
    )

class OneTimePreKey(Base):
    __tablename__ = "one_time_prekeys"

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
    key_public: Mapped[str] = mapped_column(
        String,
        nullable=False
    )
    key_private_encrypted: Mapped[str] = mapped_column(
        String,
        nullable=False
    )
    is_used: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    # Relationship
    user: Mapped["User"] = relationship(
        "User",
        lazy="selectin"
    )
