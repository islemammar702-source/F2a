import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.common import ORM


class PaymentMethod(BaseModel):
    code: str = Field(min_length=1, max_length=32, pattern="^[a-z0-9_]+$")
    label_fr: str = Field(min_length=1, max_length=64)
    label_ar: str = Field(min_length=1, max_length=64)
    active: bool = True


class CompanySettingsOut(ORM):
    name: str
    tagline_fr: str | None
    tagline_ar: str | None
    logo_document_id: uuid.UUID | None
    address: str | None
    city: str | None
    phone: str | None
    whatsapp: str | None
    email: str | None
    website: str | None
    tax_id: str | None
    trade_register: str | None
    bank_name: str | None
    bank_rib: str | None
    bank_iban: str | None
    currency: str
    tax_rates: list[Decimal]
    default_tax_rate: Decimal
    stamp_duty: Decimal
    apply_stamp_duty: bool
    quote_prefix: str
    invoice_prefix: str
    payment_prefix: str
    number_padding: int
    quote_validity_days: int
    invoice_due_days: int
    payment_methods: list[PaymentMethod]
    payment_terms_fr: str | None
    payment_terms_ar: str | None
    terms_fr: str | None
    terms_ar: str | None
    footer_fr: str | None
    footer_ar: str | None


class PublicCompanyOut(ORM):
    name: str
    tagline_fr: str | None
    tagline_ar: str | None
    address: str | None
    city: str | None
    phone: str | None
    whatsapp: str | None
    email: str | None
    website: str | None
    has_logo: bool = False


class CompanySettingsUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=200)
    tagline_fr: str | None = Field(None, max_length=255)
    tagline_ar: str | None = Field(None, max_length=255)
    address: str | None = Field(None, max_length=255)
    city: str | None = Field(None, max_length=100)
    phone: str | None = Field(None, max_length=32)
    whatsapp: str | None = Field(None, max_length=32)
    email: EmailStr | None = None
    website: str | None = Field(None, max_length=255)
    tax_id: str | None = Field(None, max_length=64)
    trade_register: str | None = Field(None, max_length=64)
    bank_name: str | None = Field(None, max_length=120)
    bank_rib: str | None = Field(None, max_length=64)
    bank_iban: str | None = Field(None, max_length=64)
    tax_rates: list[Decimal] | None = Field(None, min_length=1, max_length=10)
    default_tax_rate: Decimal | None = Field(None, ge=0, le=100)
    stamp_duty: Decimal | None = Field(None, ge=0, max_digits=12, decimal_places=3)
    apply_stamp_duty: bool | None = None
    quote_prefix: str | None = Field(None, min_length=1, max_length=10, pattern="^[A-Z0-9]+$")
    invoice_prefix: str | None = Field(None, min_length=1, max_length=10, pattern="^[A-Z0-9]+$")
    payment_prefix: str | None = Field(None, min_length=1, max_length=10, pattern="^[A-Z0-9]+$")
    number_padding: int | None = Field(None, ge=2, le=6)
    quote_validity_days: int | None = Field(None, ge=1, le=365)
    invoice_due_days: int | None = Field(None, ge=0, le=365)
    payment_methods: list[PaymentMethod] | None = Field(None, min_length=1, max_length=20)
    payment_terms_fr: str | None = Field(None, max_length=5000)
    payment_terms_ar: str | None = Field(None, max_length=5000)
    terms_fr: str | None = Field(None, max_length=10000)
    terms_ar: str | None = Field(None, max_length=10000)
    footer_fr: str | None = Field(None, max_length=1000)
    footer_ar: str | None = Field(None, max_length=1000)

    @field_validator("email", mode="before")
    @classmethod
    def empty_email(cls, v):
        return v or None

    @field_validator("tax_rates")
    @classmethod
    def valid_rates(cls, v):
        if v is not None:
            for r in v:
                if r < 0 or r > 100:
                    raise ValueError("invalid_tva_rate")
        return v


class DocumentOut(ORM):
    id: uuid.UUID
    kind: str
    entity_type: str | None
    entity_id: uuid.UUID | None
    filename: str
    mime_type: str
    size_bytes: int
    created_at: datetime


class NotificationOut(ORM):
    id: uuid.UUID
    type: str
    data: dict
    link: str | None
    is_read: bool
    created_at: datetime


class ActivityOut(ORM):
    id: uuid.UUID
    action: str
    entity_type: str | None
    entity_id: uuid.UUID | None
    summary: str | None
    created_at: datetime
    user_name: str | None = None


class QuoteRequestIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    phone: str = Field(min_length=6, max_length=32)
    email: EmailStr | None = None
    service: str = Field(min_length=2, max_length=64)
    address: str | None = Field(None, max_length=255)
    message: str = Field(min_length=5, max_length=5000)
    website: str | None = None  # honeypot: must stay empty

    @field_validator("email", mode="before")
    @classmethod
    def empty_email(cls, v):
        return v or None


class QuoteRequestOut(ORM):
    id: uuid.UUID
    client_id: uuid.UUID | None
    name: str
    phone: str
    email: str | None
    service: str
    address: str | None
    message: str
    status: str
    internal_notes: str | None
    created_at: datetime


class QuoteRequestUpdate(BaseModel):
    status: str | None = Field(None, pattern="^(new|in_progress|quoted|closed)$")
    internal_notes: str | None = Field(None, max_length=5000)
    client_id: uuid.UUID | None = None


class ContactIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    phone: str = Field(min_length=6, max_length=32)
    email: EmailStr | None = None
    message: str = Field(min_length=5, max_length=5000)
    website: str | None = None

    @field_validator("email", mode="before")
    @classmethod
    def empty_email(cls, v):
        return v or None
