import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import DateTime, Numeric, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

# Monetary amounts in Tunisian dinars: 3 decimals (millimes)
Money = Numeric(12, 3)
Qty = Numeric(12, 3)
Rate = Numeric(5, 2)

ZERO = Decimal("0.000")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
