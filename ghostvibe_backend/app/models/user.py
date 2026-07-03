import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database.base_class import Base
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.crypto_key import CryptoKey
    from app.models.preferences import UserPreference

class User(Base):
    __tablename__ = "users"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True
    )
    username_hash: Mapped[str] = mapped_column(
        String(64),
        unique=True,
        index=True,
        nullable=False
    )
    identity_key_public: Mapped[str] = mapped_column(
        String,
        nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True
    )
    last_login: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    last_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True
    )
    is_blocked: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        index=True
    )
    is_suspended: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        index=True
    )
    is_deleted: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        index=True
    )
    role: Mapped[str] = mapped_column(
        String(50),
        default="user",
        nullable=False
    )
    premium_status: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False
    )
    verification_status: Mapped[str] = mapped_column(
        String(50),
        default="verified",
        nullable=False
    )

    phone_number: Mapped[str] = mapped_column(
        String(100),
        nullable=True,
        index=True
    )
    username: Mapped[str] = mapped_column(
        String(100),
        nullable=True,
        index=True
    )
    full_name: Mapped[str] = mapped_column(
        String(100),
        nullable=True,
        index=True
    )
    email: Mapped[str] = mapped_column(
        String(255),
        nullable=True,
        index=True
    )

    # Relationships
    crypto_keys: Mapped[list["CryptoKey"]] = relationship(
        "CryptoKey",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin"
    )
    preferences: Mapped["UserPreference"] = relationship(
        "UserPreference",
        back_populates="user",
        cascade="all, delete-orphan",
        uselist=False,
        lazy="selectin"
    )
