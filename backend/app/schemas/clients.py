import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.common import ORM


class ClientBase(BaseModel):
    client_type: str = Field("individual", pattern="^(individual|company|public)$")
    name: str = Field(min_length=2, max_length=200)
    contact_name: str | None = Field(None, max_length=160)
    phone: str | None = Field(None, max_length=32)
    whatsapp: str | None = Field(None, max_length=32)
    email: EmailStr | None = None
    address: str | None = Field(None, max_length=255)
    city: str | None = Field(None, max_length=100)
    tax_id: str | None = Field(None, max_length=64)
    notes: str | None = Field(None, max_length=5000)

    @field_validator("email", mode="before")
    @classmethod
    def empty_email(cls, v):
        return v or None


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    client_type: str | None = Field(None, pattern="^(individual|company|public)$")
    name: str | None = Field(None, min_length=2, max_length=200)
    contact_name: str | None = Field(None, max_length=160)
    phone: str | None = Field(None, max_length=32)
    whatsapp: str | None = Field(None, max_length=32)
    email: EmailStr | None = None
    address: str | None = Field(None, max_length=255)
    city: str | None = Field(None, max_length=100)
    tax_id: str | None = Field(None, max_length=64)
    notes: str | None = Field(None, max_length=5000)

    @field_validator("email", mode="before")
    @classmethod
    def empty_email(cls, v):
        return v or None


class ClientOut(ORM):
    id: uuid.UUID
    client_type: str
    name: str
    contact_name: str | None
    phone: str | None
    whatsapp: str | None
    email: str | None
    address: str | None
    city: str | None
    tax_id: str | None
    notes: str | None
    is_archived: bool
    created_at: datetime


class ClientListItem(ClientOut):
    total_invoiced: Decimal = Decimal("0")
    balance: Decimal = Decimal("0")


class ClientBrief(ORM):
    id: uuid.UUID
    name: str
    client_type: str
    phone: str | None
    email: str | None
    address: str | None
    city: str | None
    tax_id: str | None
    whatsapp: str | None
