"""Invoices (factures)."""
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.routes.quotes import pdf_response
from app.core.deps import client_ip, require_permission
from app.db.session import get_db
from app.models import ActivityLog, Client, Invoice, Quote, User
from app.schemas.common import Page
from app.schemas.sales import CancelIn, FromQuoteIn, InvoiceIn, InvoiceListItem, InvoiceOut, InvoiceUpdate, LineIn, SendIn
from app.schemas.system import ActivityOut
from app.services import pdf
from app.services.audit import log_activity, notify_client_users, notify_permission
from app.services.mailer import send_email, smtp_configured
from app.services.numbering import next_number
from app.services.sales import (
    bad_request,
    default_invoice_dates,
    get_active_client,
    invoice_has_valid_payments,
    lock_invoice,
    recompute_invoice,
    refresh_overdue_invoices,
    set_invoice_items,
)
from app.services.settings_service import get_company_settings
from app.services.storage import logo_path, store_generated_pdf

router = APIRouter(prefix="/invoices", tags=["invoices"])


def invoice_out(db: Session, inv: Invoice) -> InvoiceOut:
    editable = inv.status != "cancelled" and not invoice_has_valid_payments(db, inv.id)
    return InvoiceOut.model_validate(inv).model_copy(update={"editable_items": editable})


def get_invoice_or_404(db: Session, invoice_id: uuid.UUID) -> Invoice:
    inv = db.get(Invoice, invoice_id)
    if inv is None:
        raise HTTPException(404, detail="invoice_not_found")
    return inv


def mark_overdue(db: Session) -> None:
    newly = refresh_overdue_invoices(db)
    for inv in newly:
        notify_permission(db, "invoices.view", "invoice.overdue", {"number": inv.number, "client": inv.client.name},
                          f"/invoices/{inv.id}")
    db.commit()


def generate_invoice_pdf(db: Session, inv: Invoice, lang: str, user: User | None) -> bytes:
    cs = get_company_settings(db)
    data = pdf.render_invoice_pdf(inv, cs, lang, logo_path(db, cs))
    store_generated_pdf(db, data, kind="invoice_pdf", filename=f"{inv.number}-{lang}.pdf", entity_type="invoice",
                        entity_id=inv.id, client_id=inv.client_id, user_id=user.id if user else None)
    db.commit()
    return data


def _created(db: Session, inv: Invoice, actor: User, request: Request) -> None:
    log_activity(db, actor, "invoice.created", "invoice", inv.id, summary=inv.number, ip=client_ip(request),
                 details={"total_due": str(inv.total_due), "quote_id": str(inv.quote_id) if inv.quote_id else None})
    notify_permission(db, "invoices.view", "invoice.created", {"number": inv.number, "client": inv.client.name},
                      f"/invoices/{inv.id}", exclude_user_id=actor.id)
    notify_client_users(db, inv.client_id, "invoice.received", {"number": inv.number}, "/portal/invoices")


@router.get("", response_model=Page[InvoiceListItem])
def list_invoices(
    q: str | None = None, status: str | None = None, client_id: uuid.UUID | None = None,
    date_from: date | None = None, date_to: date | None = None, open_only: bool = False,
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db), _: User = Depends(require_permission("invoices.view")),
):
    mark_overdue(db)
    stmt = select(Invoice).join(Client, Client.id == Invoice.client_id)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Invoice.number.ilike(like), Invoice.title.ilike(like), Client.name.ilike(like)))
    if status:
        stmt = stmt.where(Invoice.status == status)
    if open_only:
        stmt = stmt.where(Invoice.status.in_(("unpaid", "partial", "overdue")))
    if client_id:
        stmt = stmt.where(Invoice.client_id == client_id)
    if date_from:
        stmt = stmt.where(Invoice.issue_date >= date_from)
    if date_to:
        stmt = stmt.where(Invoice.issue_date <= date_to)
    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = db.execute(stmt.order_by(Invoice.issue_date.desc(), Invoice.number.desc())
                      .offset((page - 1) * page_size).limit(page_size)).unique().scalars().all()
    return Page(items=rows, total=total, page=page, page_size=page_size)


@router.post("", response_model=InvoiceOut, status_code=201)
def create_invoice(data: InvoiceIn, request: Request, db: Session = Depends(get_db),
                   actor: User = Depends(require_permission("invoices.manage"))):
    get_active_client(db, data.client_id)
    issue, due = default_invoice_dates(db, data.issue_date, data.due_date)
    inv = Invoice(number=next_number(db, "invoice", issue), client_id=data.client_id, title=data.title,
                  site_address=data.site_address, issue_date=issue, due_date=due, payment_terms=data.payment_terms,
                  notes=data.notes, language=data.language, status="unpaid", created_by_id=actor.id)
    db.add(inv)
    set_invoice_items(db, inv, data.items)
    db.flush()
    recompute_invoice(db, inv, apply_stamp=data.apply_stamp_duty and get_company_settings(db).apply_stamp_duty)
    db.flush()
    db.refresh(inv)
    _created(db, inv, actor, request)
    db.commit()
    return invoice_out(db, inv)


@router.post("/from-quote/{quote_id}", response_model=InvoiceOut, status_code=201)
def from_quote(quote_id: uuid.UUID, data: FromQuoteIn, request: Request, db: Session = Depends(get_db),
               actor: User = Depends(require_permission("invoices.manage"))):
    quote = db.execute(select(Quote).where(Quote.id == quote_id).with_for_update(of=Quote)).unique().scalar_one_or_none()
    if quote is None:
        raise HTTPException(404, detail="quote_not_found")
    if quote.status != "accepted":
        raise bad_request("quote_not_accepted")
    existing = db.execute(select(Invoice.id).where(Invoice.quote_id == quote.id, Invoice.status != "cancelled")).first()
    if existing:
        raise HTTPException(409, detail="quote_already_invoiced")
    issue, due = default_invoice_dates(db, data.issue_date, data.due_date)
    inv = Invoice(number=next_number(db, "invoice", issue), client_id=quote.client_id, quote_id=quote.id,
                  title=quote.title, site_address=quote.site_address, issue_date=issue, due_date=due,
                  payment_terms=quote.payment_terms, notes=quote.notes, language=quote.language, status="unpaid",
                  created_by_id=actor.id)
    db.add(inv)
    lines = [LineIn(item_type=i.item_type, designation=i.designation, description=i.description, quantity=i.quantity,
                    unit=i.unit, unit_price_ht=i.unit_price_ht, discount=i.discount, tva_rate=i.tva_rate)
             for i in quote.items]
    set_invoice_items(db, inv, lines)
    db.flush()
    recompute_invoice(db, inv, apply_stamp=data.apply_stamp_duty and get_company_settings(db).apply_stamp_duty)
    db.flush()
    db.refresh(inv)
    _created(db, inv, actor, request)
    log_activity(db, actor, "quote.converted", "quote", quote.id, summary=f"{quote.number} → {inv.number}")
    db.commit()
    return invoice_out(db, inv)


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(invoice_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require_permission("invoices.view"))):
    mark_overdue(db)
    return invoice_out(db, get_invoice_or_404(db, invoice_id))


@router.patch("/{invoice_id}", response_model=InvoiceOut)
def update_invoice(invoice_id: uuid.UUID, data: InvoiceUpdate, request: Request, db: Session = Depends(get_db),
                   actor: User = Depends(require_permission("invoices.manage"))):
    inv = lock_invoice(db, invoice_id)
    if inv.status == "cancelled":
        raise bad_request("invoice_cancelled")
    payload = data.model_dump(exclude_unset=True)
    has_payments = invoice_has_valid_payments(db, inv.id)
    restricted = {"client_id", "items", "issue_date", "apply_stamp_duty"}
    if has_payments and restricted.intersection(k for k, v in payload.items() if v is not None):
        raise bad_request("invoice_has_payments")
    if payload.get("client_id"):
        get_active_client(db, payload["client_id"])
        inv.client_id = payload["client_id"]
    for f in ("title", "site_address", "payment_terms", "notes", "language"):
        if f in payload and (payload[f] is not None or f in ("site_address", "payment_terms", "notes")):
            setattr(inv, f, payload[f])
    if payload.get("issue_date"):
        inv.issue_date = payload["issue_date"]
    if payload.get("due_date"):
        inv.due_date = payload["due_date"]
    if inv.due_date < inv.issue_date:
        raise bad_request("due_before_issue")
    if data.items is not None:
        set_invoice_items(db, inv, data.items)
    db.flush()
    recompute_invoice(db, inv, apply_stamp=payload.get("apply_stamp_duty"))
    log_activity(db, actor, "invoice.updated", "invoice", inv.id, summary=inv.number, ip=client_ip(request),
                 details={"fields": sorted(payload), "total_due": str(inv.total_due)})
    db.commit()
    db.refresh(inv)
    return invoice_out(db, inv)


@router.post("/{invoice_id}/cancel", response_model=InvoiceOut)
def cancel_invoice(invoice_id: uuid.UUID, data: CancelIn, request: Request, db: Session = Depends(get_db),
                   actor: User = Depends(require_permission("invoices.manage"))):
    inv = lock_invoice(db, invoice_id)
    if inv.status == "cancelled":
        raise bad_request("invoice_cancelled")
    if invoice_has_valid_payments(db, inv.id):
        raise bad_request("invoice_has_payments")
    inv.status = "cancelled"
    inv.cancelled_at = datetime.now(timezone.utc)
    inv.cancel_reason = data.reason
    log_activity(db, actor, "invoice.cancelled", "invoice", inv.id, summary=inv.number, ip=client_ip(request),
                 details={"reason": data.reason})
    db.commit()
    return invoice_out(db, inv)


@router.post("/{invoice_id}/send")
def send_invoice(invoice_id: uuid.UUID, data: SendIn, request: Request, db: Session = Depends(get_db),
                 actor: User = Depends(require_permission("invoices.manage"))):
    inv = get_invoice_or_404(db, invoice_id)
    if inv.status == "cancelled":
        raise bad_request("invoice_cancelled")
    delivered = False
    if data.channel == "email":
        to = data.email or inv.client.email
        if not to:
            raise bad_request("client_email_missing")
        if smtp_configured():
            content = generate_invoice_pdf(db, inv, data.lang, actor)
            cs = get_company_settings(db)
            body = data.message or (f"Bonjour,\n\nVeuillez trouver ci-joint la facture {inv.number} d'un montant de "
                                    f"{pdf.fmt_money(inv.total_due)}.\nReste à payer : {pdf.fmt_money(inv.balance)}.\n\n"
                                    f"Cordialement,\n{cs.name}")
            delivered = send_email(to, f"{cs.name} – Facture {inv.number}", body,
                                   [(f"{inv.number}.pdf", content, "application/pdf")])
    inv.sent_at = datetime.now(timezone.utc)
    log_activity(db, actor, "invoice.sent", "invoice", inv.id, summary=inv.number, ip=client_ip(request),
                 details={"channel": data.channel, "delivered": delivered})
    db.commit()
    return {"channel": data.channel, "delivered": delivered, "smtp_configured": smtp_configured()}


@router.get("/{invoice_id}/pdf")
def invoice_pdf(invoice_id: uuid.UUID, lang: str = Query("fr", pattern="^(fr|ar)$"), download: bool = False,
                db: Session = Depends(get_db), user: User = Depends(require_permission("invoices.view"))):
    inv = get_invoice_or_404(db, invoice_id)
    return pdf_response(generate_invoice_pdf(db, inv, lang, user), f"{inv.number}-{lang}.pdf", download)


@router.get("/{invoice_id}/history", response_model=list[ActivityOut])
def invoice_history(invoice_id: uuid.UUID, db: Session = Depends(get_db),
                    _: User = Depends(require_permission("invoices.view"))):
    inv = get_invoice_or_404(db, invoice_id)
    pay_ids = [p.id for p in inv.payments]
    rows = db.execute(
        select(ActivityLog, User.full_name).outerjoin(User, User.id == ActivityLog.user_id)
        .where(or_((ActivityLog.entity_type == "invoice") & (ActivityLog.entity_id == inv.id),
                   (ActivityLog.entity_type == "payment") & (ActivityLog.entity_id.in_(pay_ids or [uuid.uuid4()]))))
        .order_by(ActivityLog.created_at.desc())
    ).all()
    return [ActivityOut.model_validate(a).model_copy(update={"user_name": n}) for a, n in rows]
