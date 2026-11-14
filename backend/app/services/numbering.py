"""Unique sequential document numbers (DEV-2026-001, FAC-2026-001, PAY-2026-001).

The counter row is locked with SELECT ... FOR UPDATE so that concurrent transactions
never obtain the same number. Must be called inside the caller's transaction.
"""
from datetime import date

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import DocumentSequence
from app.services.settings_service import get_company_settings


def next_number(db: Session, doc_type: str, on_date: date | None = None) -> str:
    cs = get_company_settings(db)
    prefix = {"quote": cs.quote_prefix, "invoice": cs.invoice_prefix, "payment": cs.payment_prefix}[doc_type]
    year = (on_date or date.today()).year
    db.execute(
        insert(DocumentSequence)
        .values(doc_type=doc_type, year=year, last_value=0)
        .on_conflict_do_nothing(index_elements=["doc_type", "year"])
    )
    seq = db.execute(
        select(DocumentSequence)
        .where(DocumentSequence.doc_type == doc_type, DocumentSequence.year == year)
        .with_for_update()
    ).scalar_one()
    seq.last_value += 1
    db.flush()
    return f"{prefix}-{year}-{seq.last_value:0{cs.number_padding}d}"
