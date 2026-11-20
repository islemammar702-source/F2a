import uuid
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.common import Money, Rate, TimestampMixin, uuid_pk


class CatalogItem(TimestampMixin, Base):
    """Materials / services with their usual price, imported from Excel and proposed while typing a line."""

    __tablename__ = "catalog_items"
    id: Mapped[uuid.UUID] = uuid_pk()
    reference: Mapped[str] = mapped_column(String(64), nullable=False)
    designation: Mapped[str] = mapped_column(String(255), nullable=False)
    unit: Mapped[str] = mapped_column(String(16), default="u", nullable=False)
    unit_price_ht: Mapped[Decimal] = mapped_column(Money, nullable=False)
    item_type: Mapped[str] = mapped_column(String(16), default="material", nullable=False)
    category: Mapped[str | None] = mapped_column(String(100))
    tva_rate: Mapped[Decimal | None] = mapped_column(Rate)  # None = company default rate
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (
        CheckConstraint("item_type IN ('service','material','labor')", name="ck_catalog_item_type"),
        CheckConstraint("unit_price_ht >= 0", name="ck_catalog_price"),
    )


# case-insensitive unique reference (CLIM-12 = clim-12)
Index("uq_catalog_reference", func.lower(CatalogItem.reference), unique=True)
