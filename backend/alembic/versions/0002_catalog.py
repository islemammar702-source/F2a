"""material / price catalogue

Revision ID: 0002
Revises: 0001
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "catalog_items",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("reference", sa.String(length=64), nullable=False),
        sa.Column("designation", sa.String(length=255), nullable=False),
        sa.Column("unit", sa.String(length=16), nullable=False),
        sa.Column("unit_price_ht", sa.Numeric(12, 3), nullable=False),
        sa.Column("item_type", sa.String(length=16), nullable=False),
        sa.Column("category", sa.String(length=100), nullable=True),
        sa.Column("tva_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("item_type IN ('service','material','labor')", name="ck_catalog_item_type"),
        sa.CheckConstraint("unit_price_ht >= 0", name="ck_catalog_price"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("uq_catalog_reference", "catalog_items", [sa.text("lower(reference)")], unique=True)


def downgrade() -> None:
    op.drop_index("uq_catalog_reference", table_name="catalog_items")
    op.drop_table("catalog_items")
