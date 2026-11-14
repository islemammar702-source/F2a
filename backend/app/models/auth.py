"""Users, roles, permissions and sessions."""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, String, Table, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.common import TimestampMixin, uuid_pk

role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", UUID(as_uuid=True), ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)


class Permission(Base):
    __tablename__ = "permissions"
    id: Mapped[uuid.UUID] = uuid_pk()
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    module: Mapped[str] = mapped_column(String(32), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))


class Role(TimestampMixin, Base):
    __tablename__ = "roles"
    id: Mapped[uuid.UUID] = uuid_pk()
    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name_fr: Mapped[str] = mapped_column(String(64), nullable=False)
    name_ar: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # A "client" kind role gives access to the client portal only
    is_client_role: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    permissions: Mapped[list[Permission]] = relationship(secondary=role_permissions, lazy="selectin")


class User(TimestampMixin, Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = uuid_pk()
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32))
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False)
    client_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"))
    language: Mapped[str] = mapped_column(String(2), default="fr", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    role: Mapped[Role] = relationship(lazy="joined")

    __table_args__ = (
        # Email unique among non-deleted users (deleted accounts keep their history)
        Index("uq_users_email_active", "email", unique=True, postgresql_where="deleted_at IS NULL"),
        Index("ix_users_role", "role_id"),
        Index("ix_users_client", "client_id"),
    )

    @property
    def permission_codes(self) -> set[str]:
        return {p.code for p in self.role.permissions}


class UserSession(Base):
    """Refresh-token backed session. Only a SHA-256 hash of the token is stored."""

    __tablename__ = "user_sessions"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    family_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    remember: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    user_agent: Mapped[str | None] = mapped_column(String(255))
    ip_address: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    replaced_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
