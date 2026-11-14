"""Company settings, documents, notifications and activity logs."""
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.common import Money, Rate, uuid_pk

DEFAULT_PAYMENT_METHODS = [
    {"code": "cash", "label_fr": "Espèces", "label_ar": "نقدًا", "active": True},
    {"code": "transfer", "label_fr": "Virement bancaire", "label_ar": "تحويل بنكي", "active": True},
    {"code": "check", "label_fr": "Chèque", "label_ar": "صك", "active": True},
    {"code": "other", "label_fr": "Autre", "label_ar": "وسيلة أخرى", "active": True},
]
DEFAULT_TAX_RATES = [0, 7, 13, 19]


class CompanySettings(Base):
    """Singleton row (id = 1)."""

    __tablename__ = "company_settings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    name: Mapped[str] = mapped_column(String(200), default="F2A TRAVAUX", nullable=False)
    tagline_fr: Mapped[str | None] = mapped_column(String(255), default="Société de Fluides et Travaux")
    tagline_ar: Mapped[str | None] = mapped_column(String(255), default="شركة الموائع والأشغال")
    logo_document_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("documents.id", ondelete="SET NULL"))
    address: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(32))
    whatsapp: Mapped[str | None] = mapped_column(String(32))
    email: Mapped[str | None] = mapped_column(String(255))
    website: Mapped[str | None] = mapped_column(String(255))
    tax_id: Mapped[str | None] = mapped_column(String(64))  # matricule fiscal
    trade_register: Mapped[str | None] = mapped_column(String(64))  # registre de commerce
    bank_name: Mapped[str | None] = mapped_column(String(120))
    bank_rib: Mapped[str | None] = mapped_column(String(64))
    bank_iban: Mapped[str | None] = mapped_column(String(64))
    currency: Mapped[str] = mapped_column(String(3), default="TND", nullable=False)
    tax_rates: Mapped[list] = mapped_column(JSONB, default=lambda: list(DEFAULT_TAX_RATES), nullable=False)
    default_tax_rate: Mapped[Decimal] = mapped_column(Rate, default=Decimal("19"), nullable=False)
    stamp_duty: Mapped[Decimal] = mapped_column(Money, default=Decimal("1.000"), nullable=False)
    apply_stamp_duty: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    quote_prefix: Mapped[str] = mapped_column(String(10), default="DEV", nullable=False)
    invoice_prefix: Mapped[str] = mapped_column(String(10), default="FAC", nullable=False)
    payment_prefix: Mapped[str] = mapped_column(String(10), default="PAY", nullable=False)
    number_padding: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    quote_validity_days: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    invoice_due_days: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    payment_methods: Mapped[list] = mapped_column(JSONB, default=lambda: list(DEFAULT_PAYMENT_METHODS), nullable=False)
    payment_terms_fr: Mapped[str | None] = mapped_column(Text)
    payment_terms_ar: Mapped[str | None] = mapped_column(Text)
    terms_fr: Mapped[str | None] = mapped_column(Text)  # conditions générales
    terms_ar: Mapped[str | None] = mapped_column(Text)
    footer_fr: Mapped[str | None] = mapped_column(Text)
    footer_ar: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Document(Base):
    """Stored file (generated PDF, payment proof, logo...). Files live outside any web root."""

    __tablename__ = "documents"
    id: Mapped[uuid.UUID] = uuid_pk()
    kind: Mapped[str] = mapped_column(String(32), nullable=False)  # quote_pdf | invoice_pdf | payment_proof | logo | other
    entity_type: Mapped[str | None] = mapped_column(String(32))
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    client_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (Index("ix_documents_entity", "entity_type", "entity_id"),)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[str] = mapped_column(String(48), nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    link: Mapped[str | None] = mapped_column(String(255))
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (Index("ix_notifications_user_unread", "user_id", "is_read", "created_at"),)


class ActivityLog(Base):
    __tablename__ = "activity_logs"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(32))
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    summary: Mapped[str | None] = mapped_column(String(255))
    details: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_activity_created", "created_at"),
        Index("ix_activity_entity", "entity_type", "entity_id"),
    )
