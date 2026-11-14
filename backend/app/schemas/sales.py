import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.schemas.clients import ClientBrief
from app.schemas.common import ORM


class LineIn(BaseModel):
    item_type: str = Field("service", pattern="^(service|material|labor)$")
    designation: str = Field(min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=3)
    unit: str = Field("u", min_length=1, max_length=16)
    unit_price_ht: Decimal = Field(ge=0, max_digits=12, decimal_places=3)
    discount: Decimal = Field(Decimal("0"), ge=0, max_digits=12, decimal_places=3)
    tva_rate: Decimal = Field(ge=0, le=100, max_digits=5, decimal_places=2)
    # Totals sent by the client are IGNORED: always recomputed server side.


class LineOut(ORM):
    id: uuid.UUID
    position: int
    item_type: str
    designation: str
    description: str | None
    quantity: Decimal
    unit: str
    unit_price_ht: Decimal
    discount: Decimal
    tva_rate: Decimal
    total_ht: Decimal
    total_tva: Decimal
    total_ttc: Decimal


# ---------- Quotes ----------
class QuoteIn(BaseModel):
    client_id: uuid.UUID
    request_id: uuid.UUID | None = None
    title: str = Field(min_length=2, max_length=255)
    site_address: str | None = Field(None, max_length=255)
    issue_date: date | None = None
    validity_date: date | None = None
    payment_terms: str | None = Field(None, max_length=5000)
    special_conditions: str | None = Field(None, max_length=5000)
    notes: str | None = Field(None, max_length=5000)
    language: str = Field("fr", pattern="^(fr|ar)$")
    items: list[LineIn] = Field(min_length=1, max_length=300)


class QuoteListItem(ORM):
    id: uuid.UUID
    number: str
    title: str
    status: str
    issue_date: date
    validity_date: date
    total_ht: Decimal
    total_ttc: Decimal
    client: ClientBrief
    created_at: datetime


class QuoteOut(QuoteListItem):
    request_id: uuid.UUID | None
    site_address: str | None
    payment_terms: str | None
    special_conditions: str | None
    notes: str | None
    language: str
    subtotal_ht: Decimal
    total_discount: Decimal
    total_tva: Decimal
    sent_at: datetime | None
    decided_at: datetime | None
    decision_comment: str | None
    items: list[LineOut]
    invoice_id: uuid.UUID | None = None
    invoice_number: str | None = None


class StatusChange(BaseModel):
    status: str
    comment: str | None = Field(None, max_length=2000)


class DecisionIn(BaseModel):
    decision: str = Field(pattern="^(accepted|refused)$")
    comment: str | None = Field(None, max_length=2000)


class SendIn(BaseModel):
    channel: str = Field("email", pattern="^(email|whatsapp|manual)$")
    email: str | None = None
    message: str | None = Field(None, max_length=5000)
    lang: str = Field("fr", pattern="^(fr|ar)$")


# ---------- Invoices ----------
class InvoiceIn(BaseModel):
    client_id: uuid.UUID
    title: str = Field(min_length=2, max_length=255)
    site_address: str | None = Field(None, max_length=255)
    issue_date: date | None = None
    due_date: date | None = None
    payment_terms: str | None = Field(None, max_length=5000)
    notes: str | None = Field(None, max_length=5000)
    language: str = Field("fr", pattern="^(fr|ar)$")
    apply_stamp_duty: bool = True
    items: list[LineIn] = Field(min_length=1, max_length=300)


class InvoiceUpdate(BaseModel):
    """Full edit allowed only while no valid payment exists; otherwise only notes/terms/due date."""

    client_id: uuid.UUID | None = None
    title: str | None = Field(None, min_length=2, max_length=255)
    site_address: str | None = Field(None, max_length=255)
    issue_date: date | None = None
    due_date: date | None = None
    payment_terms: str | None = Field(None, max_length=5000)
    notes: str | None = Field(None, max_length=5000)
    language: str | None = Field(None, pattern="^(fr|ar)$")
    apply_stamp_duty: bool | None = None
    items: list[LineIn] | None = Field(None, min_length=1, max_length=300)


class FromQuoteIn(BaseModel):
    issue_date: date | None = None
    due_date: date | None = None
    apply_stamp_duty: bool = True


class CancelIn(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)


class PaymentBrief(ORM):
    id: uuid.UUID
    number: str
    amount: Decimal
    payment_date: date
    method: str
    reference: str | None
    status: str
    cancel_reason: str | None
    comment: str | None


class InvoiceListItem(ORM):
    id: uuid.UUID
    number: str
    title: str
    status: str
    issue_date: date
    due_date: date
    total_ttc: Decimal
    total_due: Decimal
    amount_paid: Decimal
    balance: Decimal
    client: ClientBrief
    created_at: datetime


class QuoteRef(ORM):
    id: uuid.UUID
    number: str


class InvoiceOut(InvoiceListItem):
    quote: QuoteRef | None
    site_address: str | None
    payment_terms: str | None
    notes: str | None
    language: str
    subtotal_ht: Decimal
    total_discount: Decimal
    total_ht: Decimal
    total_tva: Decimal
    stamp_duty: Decimal
    sent_at: datetime | None
    cancelled_at: datetime | None
    cancel_reason: str | None
    items: list[LineOut]
    payments: list[PaymentBrief]
    editable_items: bool = False


# ---------- Payments ----------
class PaymentIn(BaseModel):
    invoice_id: uuid.UUID
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=3)
    payment_date: date | None = None
    method: str = Field(min_length=1, max_length=32)
    reference: str | None = Field(None, max_length=120)
    comment: str | None = Field(None, max_length=2000)
    proof_document_id: uuid.UUID | None = None


class InvoiceRef(ORM):
    id: uuid.UUID
    number: str
    total_due: Decimal
    balance: Decimal
    status: str


class PaymentOut(ORM):
    id: uuid.UUID
    number: str
    amount: Decimal
    payment_date: date
    method: str
    reference: str | None
    comment: str | None
    status: str
    cancelled_at: datetime | None
    cancel_reason: str | None
    proof_document_id: uuid.UUID | None
    client: ClientBrief
    invoice: InvoiceRef
    created_at: datetime
