"""Business logic for quotes, invoices and payments. All totals are computed here (never trusted from the browser)."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models import Client, Invoice, InvoiceItem, Payment, Quote, QuoteItem
from app.schemas.sales import LineIn
from app.services.calculations import ZERO, CalculationError, compute_totals, invoice_payment_status, r3
from app.services.settings_service import get_company_settings


def bad_request(code: str) -> HTTPException:
    return HTTPException(400, detail=code)


def _build_items(model_cls, lines: list[LineIn]):
    raw = [l.model_dump() for l in lines]
    try:
        totals = compute_totals(raw)
    except CalculationError as e:
        raise bad_request(str(e))
    items = []
    for pos, (line, lr) in enumerate(zip(raw, totals.lines)):
        items.append(
            model_cls(
                position=pos,
                item_type=line["item_type"],
                designation=line["designation"].strip(),
                description=line.get("description"),
                quantity=r3(line["quantity"]),
                unit=line["unit"],
                unit_price_ht=r3(line["unit_price_ht"]),
                discount=lr.discount,
                tva_rate=Decimal(str(line["tva_rate"])),
                total_ht=lr.total_ht,
                total_tva=lr.total_tva,
                total_ttc=lr.total_ttc,
            )
        )
    return items, totals


def _apply_totals(doc, totals) -> None:
    doc.subtotal_ht = totals.subtotal_ht
    doc.total_discount = totals.total_discount
    doc.total_ht = totals.total_ht
    doc.total_tva = totals.total_tva
    doc.total_ttc = totals.total_ttc


def get_active_client(db: Session, client_id) -> Client:
    client = db.get(Client, client_id)
    if client is None:
        raise HTTPException(404, detail="client_not_found")
    if client.is_archived:
        raise bad_request("client_archived")
    return client


# ---------------- Quotes ----------------
def set_quote_items(db: Session, quote: Quote, lines: list[LineIn]) -> None:
    items, totals = _build_items(QuoteItem, lines)
    quote.items.clear()
    db.flush()
    quote.items.extend(items)
    _apply_totals(quote, totals)


def default_quote_dates(db: Session, issue: date | None, validity: date | None) -> tuple[date, date]:
    cs = get_company_settings(db)
    issue = issue or date.today()
    validity = validity or issue + timedelta(days=cs.quote_validity_days)
    if validity < issue:
        raise bad_request("validity_before_issue")
    return issue, validity


def refresh_quote_statuses(db: Session) -> None:
    """Mark sent quotes whose validity date passed as expired."""
    db.execute(
        update(Quote)
        .where(Quote.status == "sent", Quote.validity_date < date.today())
        .values(status="expired")
    )


QUOTE_TRANSITIONS = {
    "draft": {"sent"},
    "sent": {"accepted", "refused", "expired", "draft"},
    "expired": {"sent", "draft"},
    "refused": {"draft"},
    "accepted": set(),
}


def change_quote_status(quote: Quote, new_status: str, comment: str | None = None) -> None:
    if new_status not in QUOTE_TRANSITIONS.get(quote.status, set()):
        raise bad_request("invalid_status_transition")
    if new_status in ("accepted", "refused") and quote.validity_date < date.today():
        raise bad_request("quote_expired")
    now = datetime.now(timezone.utc)
    if new_status == "sent":
        quote.sent_at = now
    if new_status in ("accepted", "refused"):
        quote.decided_at = now
        quote.decision_comment = comment
    quote.status = new_status


# ---------------- Invoices ----------------
def set_invoice_items(db: Session, invoice: Invoice, lines: list[LineIn]) -> None:
    items, totals = _build_items(InvoiceItem, lines)
    invoice.items.clear()
    db.flush()
    invoice.items.extend(items)
    _apply_totals(invoice, totals)


def default_invoice_dates(db: Session, issue: date | None, due: date | None) -> tuple[date, date]:
    cs = get_company_settings(db)
    issue = issue or date.today()
    due = due or issue + timedelta(days=cs.invoice_due_days)
    if due < issue:
        raise bad_request("due_before_issue")
    return issue, due


def valid_payments_total(db: Session, invoice_id) -> Decimal:
    total = db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.invoice_id == invoice_id, Payment.status == "valid"
        )
    ).scalar_one()
    return r3(total)


def recompute_invoice(db: Session, invoice: Invoice, apply_stamp: bool | None = None) -> None:
    """Recompute total_due, amount_paid, balance and status from items and VALID payments."""
    if apply_stamp is not None:
        cs = get_company_settings(db)
        invoice.stamp_duty = r3(cs.stamp_duty) if apply_stamp else ZERO
    invoice.total_due = r3(invoice.total_ttc + invoice.stamp_duty)
    paid = valid_payments_total(db, invoice.id) if invoice.id else ZERO
    if paid > invoice.total_due:
        raise bad_request("total_below_payments")
    invoice.amount_paid = paid
    invoice.balance = r3(invoice.total_due - paid)
    overdue = invoice.balance > 0 and invoice.due_date < date.today()
    invoice.status = invoice_payment_status(invoice.total_due, paid, overdue, invoice.status == "cancelled")


def refresh_overdue_invoices(db: Session) -> list[Invoice]:
    """Mark open invoices past due as overdue. Returns newly overdue invoices."""
    rows = db.execute(
        select(Invoice).where(
            Invoice.status.in_(("unpaid", "partial")), Invoice.due_date < date.today(), Invoice.balance > 0
        )
    ).scalars().all()
    for inv in rows:
        inv.status = "overdue"
    return list(rows)


def lock_invoice(db: Session, invoice_id) -> Invoice:
    inv = db.execute(select(Invoice).where(Invoice.id == invoice_id).with_for_update(of=Invoice)).unique().scalar_one_or_none()
    if inv is None:
        raise HTTPException(404, detail="invoice_not_found")
    return inv


def invoice_has_valid_payments(db: Session, invoice_id) -> bool:
    return db.execute(
        select(func.count()).select_from(Payment).where(Payment.invoice_id == invoice_id, Payment.status == "valid")
    ).scalar_one() > 0
