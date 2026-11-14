"""Quotes (devis), invoices (factures), payments and numbering sequences."""
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from app.db.session import Base
from app.models.common import ZERO, Money, Qty, Rate, TimestampMixin, uuid_pk
from app.models.crm import Client

QUOTE_STATUSES = ("draft", "sent", "accepted", "refused", "expired")
INVOICE_STATUSES = ("unpaid", "partial", "paid", "overdue", "cancelled")
ITEM_TYPES = ("service", "material", "labor")


class DocumentSequence(Base):
    """Per-type, per-year counter. Locked with SELECT ... FOR UPDATE when issuing numbers."""

    __tablename__ = "document_sequences"
    doc_type: Mapped[str] = mapped_column(String(16), primary_key=True)
    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_value: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class LineItemMixin:
    id: Mapped[uuid.UUID] = uuid_pk()
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    item_type: Mapped[str] = mapped_column(String(16), default="service", nullable=False)
    designation: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    quantity: Mapped[Decimal] = mapped_column(Qty, nullable=False)
    unit: Mapped[str] = mapped_column(String(16), default="u", nullable=False)
    unit_price_ht: Mapped[Decimal] = mapped_column(Money, nullable=False)
    discount: Mapped[Decimal] = mapped_column(Money, default=ZERO, nullable=False)
    tva_rate: Mapped[Decimal] = mapped_column(Rate, nullable=False)
    total_ht: Mapped[Decimal] = mapped_column(Money, nullable=False)
    total_tva: Mapped[Decimal] = mapped_column(Money, nullable=False)
    total_ttc: Mapped[Decimal] = mapped_column(Money, nullable=False)

    @declared_attr.directive
    def __table_args__(cls):
        name = cls.__tablename__
        return (
            CheckConstraint("quantity > 0", name=f"ck_{name}_qty"),
            CheckConstraint("unit_price_ht >= 0", name=f"ck_{name}_price"),
            CheckConstraint("discount >= 0", name=f"ck_{name}_discount"),
            CheckConstraint("tva_rate >= 0 AND tva_rate <= 100", name=f"ck_{name}_tva"),
            CheckConstraint("item_type IN ('service','material','labor')", name=f"ck_{name}_type"),
        )


class DocumentTotalsMixin:
    subtotal_ht: Mapped[Decimal] = mapped_column(Money, default=ZERO, nullable=False)  # before discounts
    total_discount: Mapped[Decimal] = mapped_column(Money, default=ZERO, nullable=False)
    total_ht: Mapped[Decimal] = mapped_column(Money, default=ZERO, nullable=False)
    total_tva: Mapped[Decimal] = mapped_column(Money, default=ZERO, nullable=False)
    total_ttc: Mapped[Decimal] = mapped_column(Money, default=ZERO, nullable=False)


class Quote(DocumentTotalsMixin, TimestampMixin, Base):
    __tablename__ = "quotes"
    id: Mapped[uuid.UUID] = uuid_pk()
    number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False)
    request_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("quote_requests.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    site_address: Mapped[str | None] = mapped_column(String(255))  # adresse du chantier
    status: Mapped[str] = mapped_column(String(16), default="draft", nullable=False)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    validity_date: Mapped[date] = mapped_column(Date, nullable=False)
    payment_terms: Mapped[str | None] = mapped_column(Text)
    special_conditions: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    language: Mapped[str] = mapped_column(String(2), default="fr", nullable=False)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_comment: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    client: Mapped[Client] = relationship(lazy="joined")
    items: Mapped[list["QuoteItem"]] = relationship(
        back_populates="quote", cascade="all, delete-orphan", order_by="QuoteItem.position", lazy="selectin"
    )

    __table_args__ = (
        CheckConstraint("status IN ('draft','sent','accepted','refused','expired')", name="ck_quotes_status"),
        CheckConstraint("validity_date >= issue_date", name="ck_quotes_validity"),
        Index("ix_quotes_client", "client_id"),
        Index("ix_quotes_status", "status"),
        Index("ix_quotes_issue_date", "issue_date"),
    )


class QuoteItem(LineItemMixin, Base):
    __tablename__ = "quote_items"
    quote_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("quotes.id", ondelete="CASCADE"), nullable=False, index=True)
    quote: Mapped[Quote] = relationship(back_populates="items")


class Invoice(DocumentTotalsMixin, TimestampMixin, Base):
    __tablename__ = "invoices"
    id: Mapped[uuid.UUID] = uuid_pk()
    number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False)
    quote_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("quotes.id", ondelete="RESTRICT"))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    site_address: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(16), default="unpaid", nullable=False)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    stamp_duty: Mapped[Decimal] = mapped_column(Money, default=ZERO, nullable=False)  # timbre fiscal
    total_due: Mapped[Decimal] = mapped_column(Money, default=ZERO, nullable=False)  # TTC + timbre
    amount_paid: Mapped[Decimal] = mapped_column(Money, default=ZERO, nullable=False)
    balance: Mapped[Decimal] = mapped_column(Money, default=ZERO, nullable=False)
    payment_terms: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    language: Mapped[str] = mapped_column(String(2), default="fr", nullable=False)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_reason: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    client: Mapped[Client] = relationship(lazy="joined")
    quote: Mapped[Quote | None] = relationship(lazy="joined")
    items: Mapped[list["InvoiceItem"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan", order_by="InvoiceItem.position", lazy="selectin"
    )
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="invoice", order_by="Payment.payment_date", lazy="selectin"
    )

    __table_args__ = (
        CheckConstraint("status IN ('unpaid','partial','paid','overdue','cancelled')", name="ck_invoices_status"),
        CheckConstraint("due_date >= issue_date", name="ck_invoices_due"),
        CheckConstraint("amount_paid >= 0", name="ck_invoices_paid_positive"),
        CheckConstraint("amount_paid <= total_due", name="ck_invoices_not_overpaid"),
        Index("ix_invoices_client", "client_id"),
        Index("ix_invoices_status", "status"),
        Index("ix_invoices_issue_date", "issue_date"),
        # A quote can be converted into at most one non-cancelled invoice
        Index("uq_invoices_quote_active", "quote_id", unique=True, postgresql_where="quote_id IS NOT NULL AND status <> 'cancelled'"),
    )


class InvoiceItem(LineItemMixin, Base):
    __tablename__ = "invoice_items"
    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    invoice: Mapped[Invoice] = relationship(back_populates="items")


class Payment(TimestampMixin, Base):
    """Payments are append-only. Corrections = cancellation (traced) + new payment."""

    __tablename__ = "payments"
    id: Mapped[uuid.UUID] = uuid_pk()
    number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoices.id", ondelete="RESTRICT"), nullable=False)
    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    method: Mapped[str] = mapped_column(String(32), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(120))
    comment: Mapped[str | None] = mapped_column(Text)
    proof_document_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("documents.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(16), default="valid", nullable=False)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    cancel_reason: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    invoice: Mapped[Invoice] = relationship(back_populates="payments")
    client: Mapped[Client] = relationship(lazy="joined")

    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_payments_amount_positive"),
        CheckConstraint("status IN ('valid','cancelled')", name="ck_payments_status"),
        Index("ix_payments_invoice", "invoice_id"),
        Index("ix_payments_client", "client_id"),
        Index("ix_payments_date", "payment_date"),
        UniqueConstraint("number", name="uq_payments_number"),
    )
