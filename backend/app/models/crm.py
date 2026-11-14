"""Clients and public quote requests."""
import uuid

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.common import TimestampMixin, uuid_pk

CLIENT_TYPES = ("individual", "company", "public")


class Client(TimestampMixin, Base):
    __tablename__ = "clients"
    id: Mapped[uuid.UUID] = uuid_pk()
    client_type: Mapped[str] = mapped_column(String(16), default="individual", nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)  # nom & prénom ou raison sociale
    contact_name: Mapped[str | None] = mapped_column(String(160))
    phone: Mapped[str | None] = mapped_column(String(32))
    whatsapp: Mapped[str | None] = mapped_column(String(32))
    email: Mapped[str | None] = mapped_column(String(255))
    address: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(100))
    tax_id: Mapped[str | None] = mapped_column(String(64))  # matricule fiscal
    notes: Mapped[str | None] = mapped_column(Text)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL", use_alter=True, name="fk_clients_created_by")
    )

    __table_args__ = (
        CheckConstraint("client_type IN ('individual','company','public')", name="ck_clients_type"),
        Index("ix_clients_name", "name"),
        Index("ix_clients_archived", "is_archived"),
    )


class QuoteRequest(TimestampMixin, Base):
    """Demande de devis from the public website or the client portal."""

    __tablename__ = "quote_requests"
    id: Mapped[uuid.UUID] = uuid_pk()
    client_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(32), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    service: Mapped[str] = mapped_column(String(64), nullable=False)
    address: Mapped[str | None] = mapped_column(String(255))
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="new", nullable=False)
    internal_notes: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint("status IN ('new','in_progress','quoted','closed')", name="ck_quote_requests_status"),
    )
