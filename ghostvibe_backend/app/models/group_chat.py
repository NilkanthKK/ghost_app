import uuid
from datetime import datetime
from sqlalchemy import String, ForeignKey, DateTime, Boolean, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.database.base_class import Base
from typing import TYPE_CHECKING, Optional, List

if TYPE_CHECKING:
    from app.models.user import User

class Group(Base):
    __tablename__ = "groups"

    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(
        String,
        nullable=False
    )
    avatar: Mapped[Optional[str]] = mapped_column(
        String,
        nullable=True
    )
    description: Mapped[Optional[str]] = mapped_column(
        String,
        nullable=True
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by], lazy="selectin")

class GroupMember(Base):
    __tablename__ = "group_members"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True
    )
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("groups.group_id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    role: Mapped[str] = mapped_column(
        String,
        default="member",  # admin, member
        nullable=False
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    user: Mapped["User"] = relationship("User", lazy="selectin")

class GroupInvite(Base):
    __tablename__ = "group_invites"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True
    )
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("groups.group_id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    invitee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    invited_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False
    )
    status: Mapped[str] = mapped_column(
        String,
        default="pending",  # pending, accepted, declined
        nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    invitee: Mapped["User"] = relationship("User", foreign_keys=[invitee_id], lazy="selectin")
    inviter: Mapped["User"] = relationship("User", foreign_keys=[invited_by], lazy="selectin")

class GroupKey(Base):
    __tablename__ = "group_keys"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True
    )
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("groups.group_id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    recipient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    # Encrypted Sender Keys (Chain Key + Private Signature Key)
    sender_chain_key_encrypted: Mapped[str] = mapped_column(
        String,
        nullable=False
    )
    sender_signature_key_public: Mapped[str] = mapped_column(
        String,
        nullable=False
    )
    sender_signature_key_private_encrypted: Mapped[str] = mapped_column(
        String,
        nullable=False
    )
    key_id: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    sender: Mapped["User"] = relationship("User", foreign_keys=[sender_id], lazy="selectin")
    recipient: Mapped["User"] = relationship("User", foreign_keys=[recipient_id], lazy="selectin")
