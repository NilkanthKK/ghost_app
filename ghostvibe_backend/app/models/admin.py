import uuid
from datetime import datetime
from sqlalchemy import String, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.database.base_class import Base

class AdminUser(Base):
    __tablename__ = "admin_users"

    admin_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True
    )
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False
    )
    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )
    role: Mapped[str] = mapped_column(
        String(50),
        default="admin",
        nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )
    last_login: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=True
    )

class AuditLog(Base):
    __tablename__ = "audit_logs"

    log_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True
    )
    admin_email: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )
    action: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )
    target_user_id: Mapped[str] = mapped_column(
        String(100),
        nullable=True
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )
    ip_address: Mapped[str] = mapped_column(
        String(45),
        nullable=True
    )
    device: Mapped[str] = mapped_column(
        String(255),
        nullable=True
    )
    old_value: Mapped[str] = mapped_column(
        String,
        nullable=True
    )
    new_value: Mapped[str] = mapped_column(
        String,
        nullable=True
    )
