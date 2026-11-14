"""Quotes (devis)."""
import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.deps import client_ip, require_permission
from app.db.session import get_db
from app.models import Client, Invoice, Quote, QuoteRequest, User
from app.schemas.common import Page
from app.schemas.sales import LineIn, QuoteIn, QuoteListItem, QuoteOut, SendIn, StatusChange
from app.services import pdf
from app.services.audit import log_activity, notify_client_users, notify_permission
from app.services.mailer import send_email, smtp_configured
from app.services.numbering import next_number
from app.services.sales import (
    bad_request,
    change_quote_status,
    default_quote_dates,
    get_active_client,
    refresh_quote_statuses,
    set_quote_items,
)
from app.services.settings_service import get_company_settings
from app.services.storage import logo_path, store_generated_pdf

router = APIRouter(prefix="/quotes", tags=["quotes"])


def quote_out(db: Session, quote: Quote) -> QuoteOut:
    inv = db.execute(select(Invoice.id, Invoice.number).where(Invoice.quote_id == quote.id,
                                                              Invoice.status != "cancelled")).first()
    return QuoteOut.model_validate(quote).model_copy(
        update={"invoice_id": inv[0] if inv else None, "invoice_number": inv[1] if inv else None})


def get_quote_or_404(db: Session, quote_id: uuid.UUID) -> Quote:
    q = db.get(Quote, quote_id)
    if q is None:
        raise HTTPException(404, detail="quote_not_found")
    return q


def pdf_response(data: bytes, filename: str, download: bool) -> Response:
    disp = "attachment" if download else "inline"
    return Response(data, media_type="application/pdf", headers={
        "Content-Disposition": f'{disp}; filename="{filename}"', "Cache-Control": "no-store"})


def generate_quote_pdf(db: Session, quote: Quote, lang: str, user: User | None) -> bytes:
    cs = get_company_settings(db)
    data = pdf.render_quote_pdf(quote, cs, lang, logo_path(db, cs))
    store_generated_pdf(db, data, kind="quote_pdf", filename=f"{quote.number}-{lang}.pdf", entity_type="quote",
                        entity_id=quote.id, client_id=quote.client_id, user_id=user.id if user else None)
    db.commit()
    return data


@router.get("", response_model=Page[QuoteListItem])
def list_quotes(
    q: str | None = None, status: str | None = None, client_id: uuid.UUID | None = None,
    date_from: date | None = None, date_to: date | None = None,
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db), _: User = Depends(require_permission("quotes.view")),
):
    refresh_quote_statuses(db)
    db.commit()
    stmt = select(Quote).join(Client, Client.id == Quote.client_id)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Quote.number.ilike(like), Quote.title.ilike(like), Client.name.ilike(like)))
    if status:
        stmt = stmt.where(Quote.status == status)
    if client_id:
        stmt = stmt.where(Quote.client_id == client_id)
    if date_from:
        stmt = stmt.where(Quote.issue_date >= date_from)
    if date_to:
        stmt = stmt.where(Quote.issue_date <= date_to)
    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = db.execute(stmt.order_by(Quote.issue_date.desc(), Quote.number.desc())
                      .offset((page - 1) * page_size).limit(page_size)).unique().scalars().all()
    return Page(items=rows, total=total, page=page, page_size=page_size)


@router.post("", response_model=QuoteOut, status_code=201)
def create_quote(data: QuoteIn, request: Request, db: Session = Depends(get_db),
                 actor: User = Depends(require_permission("quotes.manage"))):
    get_active_client(db, data.client_id)
    issue, validity = default_quote_dates(db, data.issue_date, data.validity_date)
    quote = Quote(
        number=next_number(db, "quote", issue), client_id=data.client_id, request_id=data.request_id,
        title=data.title, site_address=data.site_address, issue_date=issue, validity_date=validity,
        payment_terms=data.payment_terms, special_conditions=data.special_conditions, notes=data.notes,
        language=data.language, status="draft", created_by_id=actor.id,
    )
    db.add(quote)
    set_quote_items(db, quote, data.items)
    db.flush()
    if data.request_id:
        req = db.get(QuoteRequest, data.request_id)
        if req:
            req.status = "quoted"
            req.client_id = req.client_id or data.client_id
    log_activity(db, actor, "quote.created", "quote", quote.id, summary=quote.number, ip=client_ip(request),
                 details={"total_ttc": str(quote.total_ttc)})
    notify_permission(db, "quotes.view", "quote.created", {"number": quote.number, "client": quote.client.name if quote.client else ""},
                      f"/quotes/{quote.id}", exclude_user_id=actor.id)
    db.commit()
    db.refresh(quote)
    return quote_out(db, quote)


@router.get("/{quote_id}", response_model=QuoteOut)
def get_quote(quote_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require_permission("quotes.view"))):
    refresh_quote_statuses(db)
    db.commit()
    return quote_out(db, get_quote_or_404(db, quote_id))


@router.put("/{quote_id}", response_model=QuoteOut)
def update_quote(quote_id: uuid.UUID, data: QuoteIn, request: Request, db: Session = Depends(get_db),
                 actor: User = Depends(require_permission("quotes.manage"))):
    quote = get_quote_or_404(db, quote_id)
    if quote.status == "accepted":
        raise bad_request("quote_locked")
    get_active_client(db, data.client_id)
    issue, validity = default_quote_dates(db, data.issue_date or quote.issue_date, data.validity_date or quote.validity_date)
    for f in ("client_id", "title", "site_address", "payment_terms", "special_conditions", "notes", "language"):
        setattr(quote, f, getattr(data, f))
    quote.issue_date, quote.validity_date = issue, validity
    if quote.status == "expired" and validity >= date.today():
        quote.status = "sent" if quote.sent_at else "draft"
    set_quote_items(db, quote, data.items)
    log_activity(db, actor, "quote.updated", "quote", quote.id, summary=quote.number, ip=client_ip(request),
                 details={"total_ttc": str(quote.total_ttc)})
    db.commit()
    db.refresh(quote)
    return quote_out(db, quote)


@router.post("/{quote_id}/duplicate", response_model=QuoteOut, status_code=201)
def duplicate_quote(quote_id: uuid.UUID, request: Request, db: Session = Depends(get_db),
                    actor: User = Depends(require_permission("quotes.manage"))):
    src = get_quote_or_404(db, quote_id)
    cs = get_company_settings(db)
    today = date.today()
    copy = Quote(
        number=next_number(db, "quote", today), client_id=src.client_id, title=src.title, site_address=src.site_address,
        issue_date=today, validity_date=today + timedelta(days=cs.quote_validity_days), payment_terms=src.payment_terms,
        special_conditions=src.special_conditions, notes=src.notes, language=src.language, status="draft",
        created_by_id=actor.id,
    )
    db.add(copy)
    lines = [LineIn(item_type=i.item_type, designation=i.designation, description=i.description, quantity=i.quantity,
                    unit=i.unit, unit_price_ht=i.unit_price_ht, discount=i.discount, tva_rate=i.tva_rate) for i in src.items]
    set_quote_items(db, copy, lines)
    db.flush()
    log_activity(db, actor, "quote.duplicated", "quote", copy.id, summary=f"{src.number} → {copy.number}",
                 ip=client_ip(request))
    db.commit()
    db.refresh(copy)
    return quote_out(db, copy)


@router.post("/{quote_id}/status", response_model=QuoteOut)
def set_status(quote_id: uuid.UUID, data: StatusChange, request: Request, db: Session = Depends(get_db),
               actor: User = Depends(require_permission("quotes.manage"))):
    quote = get_quote_or_404(db, quote_id)
    old = quote.status
    change_quote_status(quote, data.status, data.comment)
    log_activity(db, actor, f"quote.{data.status}", "quote", quote.id, summary=quote.number, ip=client_ip(request),
                 details={"from": old, "to": data.status})
    if data.status == "accepted":
        notify_permission(db, "quotes.view", "quote.accepted", {"number": quote.number, "client": quote.client.name},
                          f"/quotes/{quote.id}", exclude_user_id=actor.id)
    if data.status == "sent":
        notify_client_users(db, quote.client_id, "quote.received", {"number": quote.number}, "/portal/quotes")
    db.commit()
    return quote_out(db, quote)


@router.post("/{quote_id}/send")
def send_quote(quote_id: uuid.UUID, data: SendIn, request: Request, db: Session = Depends(get_db),
               actor: User = Depends(require_permission("quotes.manage"))):
    quote = get_quote_or_404(db, quote_id)
    if quote.status == "draft":
        change_quote_status(quote, "sent")
        notify_client_users(db, quote.client_id, "quote.received", {"number": quote.number}, "/portal/quotes")
    delivered = False
    if data.channel == "email":
        to = data.email or quote.client.email
        if not to:
            raise bad_request("client_email_missing")
        if smtp_configured():
            content = generate_quote_pdf(db, quote, data.lang, actor)
            cs = get_company_settings(db)
            body = data.message or (f"Bonjour,\n\nVeuillez trouver ci-joint notre devis {quote.number} "
                                    f"d'un montant de {pdf.fmt_money(quote.total_ttc)} TTC.\n\nCordialement,\n{cs.name}")
            delivered = send_email(to, f"{cs.name} – Devis {quote.number}", body,
                                   [(f"{quote.number}.pdf", content, "application/pdf")])
    log_activity(db, actor, "quote.sent", "quote", quote.id, summary=quote.number, ip=client_ip(request),
                 details={"channel": data.channel, "delivered": delivered})
    db.commit()
    return {"status": quote.status, "channel": data.channel, "delivered": delivered,
            "smtp_configured": smtp_configured()}


@router.get("/{quote_id}/pdf")
def quote_pdf(quote_id: uuid.UUID, lang: str = Query("fr", pattern="^(fr|ar)$"), download: bool = False,
              db: Session = Depends(get_db), user: User = Depends(require_permission("quotes.view"))):
    quote = get_quote_or_404(db, quote_id)
    return pdf_response(generate_quote_pdf(db, quote, lang, user), f"{quote.number}-{lang}.pdf", download)
