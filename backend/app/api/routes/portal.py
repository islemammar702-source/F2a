"""Client portal. Every query is scoped to the authenticated user's client_id (data isolation)."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.routes.invoices import generate_invoice_pdf, mark_overdue
from app.api.routes.quotes import generate_quote_pdf, pdf_response
from app.core.deps import client_ip, require_client
from app.db.session import get_db
from app.models import Client, Invoice, Payment, Quote, QuoteRequest, User
from app.schemas.clients import ClientOut
from app.schemas.sales import DecisionIn, InvoiceListItem, InvoiceOut, PaymentOut, QuoteListItem, QuoteOut
from app.schemas.system import QuoteRequestIn, QuoteRequestOut
from app.services.audit import log_activity, notify_permission
from app.services.calculations import r3
from app.services.sales import change_quote_status, refresh_quote_statuses

router = APIRouter(prefix="/portal", tags=["portal"])

VISIBLE_QUOTES = ("sent", "accepted", "refused", "expired")


def _own_quote(db: Session, user: User, quote_id: uuid.UUID) -> Quote:
    q = db.get(Quote, quote_id)
    if q is None or q.client_id != user.client_id or q.status not in VISIBLE_QUOTES:
        raise HTTPException(404, detail="not_found")
    return q


def _own_invoice(db: Session, user: User, invoice_id: uuid.UUID) -> Invoice:
    inv = db.get(Invoice, invoice_id)
    if inv is None or inv.client_id != user.client_id:
        raise HTTPException(404, detail="not_found")
    return inv


@router.get("/summary")
def portal_summary(db: Session = Depends(get_db), user: User = Depends(require_client)):
    refresh_quote_statuses(db)
    mark_overdue(db)
    cid = user.client_id
    tot = db.execute(select(func.coalesce(func.sum(Invoice.total_due), 0), func.coalesce(func.sum(Invoice.amount_paid), 0),
                            func.coalesce(func.sum(Invoice.balance), 0)).where(Invoice.client_id == cid,
                                                                                Invoice.status != "cancelled")).one()
    pending = db.execute(select(func.count()).select_from(Quote).where(Quote.client_id == cid, Quote.status == "sent")).scalar_one()
    open_inv = db.execute(select(func.count()).select_from(Invoice).where(
        Invoice.client_id == cid, Invoice.status.in_(("unpaid", "partial", "overdue")))).scalar_one()
    return {"client": ClientOut.model_validate(db.get(Client, cid)),
            "totals": {"invoiced": r3(tot[0]), "paid": r3(tot[1]), "balance": r3(tot[2])},
            "pending_quotes": pending, "open_invoices": open_inv}


@router.get("/quotes", response_model=list[QuoteListItem])
def my_quotes(db: Session = Depends(get_db), user: User = Depends(require_client)):
    refresh_quote_statuses(db)
    db.commit()
    return db.execute(select(Quote).where(Quote.client_id == user.client_id, Quote.status.in_(VISIBLE_QUOTES))
                      .order_by(Quote.issue_date.desc())).unique().scalars().all()


@router.get("/quotes/{quote_id}", response_model=QuoteOut)
def my_quote(quote_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_client)):
    return _own_quote(db, user, quote_id)


@router.post("/quotes/{quote_id}/decision", response_model=QuoteOut)
def decide(quote_id: uuid.UUID, data: DecisionIn, request: Request, db: Session = Depends(get_db),
           user: User = Depends(require_client)):
    q = _own_quote(db, user, quote_id)
    if q.status != "sent":
        raise HTTPException(400, detail="quote_not_pending")
    change_quote_status(q, data.decision, data.comment)
    log_activity(db, user, f"quote.{data.decision}", "quote", q.id, summary=f"{q.number} (portail client)",
                 ip=client_ip(request), details={"comment": data.comment})
    notify_permission(db, "quotes.view", f"quote.{data.decision}", {"number": q.number, "client": q.client.name},
                      f"/quotes/{q.id}")
    db.commit()
    return q


@router.get("/quotes/{quote_id}/pdf")
def my_quote_pdf(quote_id: uuid.UUID, lang: str = Query("fr", pattern="^(fr|ar)$"), download: bool = False,
                 db: Session = Depends(get_db), user: User = Depends(require_client)):
    q = _own_quote(db, user, quote_id)
    return pdf_response(generate_quote_pdf(db, q, lang, user), f"{q.number}-{lang}.pdf", download)


@router.get("/invoices", response_model=list[InvoiceListItem])
def my_invoices(db: Session = Depends(get_db), user: User = Depends(require_client)):
    mark_overdue(db)
    return db.execute(select(Invoice).where(Invoice.client_id == user.client_id).order_by(Invoice.issue_date.desc())).unique().scalars().all()


@router.get("/invoices/{invoice_id}", response_model=InvoiceOut)
def my_invoice(invoice_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_client)):
    return _own_invoice(db, user, invoice_id)


@router.get("/invoices/{invoice_id}/pdf")
def my_invoice_pdf(invoice_id: uuid.UUID, lang: str = Query("fr", pattern="^(fr|ar)$"), download: bool = False,
                   db: Session = Depends(get_db), user: User = Depends(require_client)):
    inv = _own_invoice(db, user, invoice_id)
    return pdf_response(generate_invoice_pdf(db, inv, lang, user), f"{inv.number}-{lang}.pdf", download)


@router.get("/payments", response_model=list[PaymentOut])
def my_payments(db: Session = Depends(get_db), user: User = Depends(require_client)):
    return db.execute(select(Payment).where(Payment.client_id == user.client_id, Payment.status == "valid")
                      .order_by(Payment.payment_date.desc())).unique().scalars().all()


@router.get("/requests", response_model=list[QuoteRequestOut])
def my_requests(db: Session = Depends(get_db), user: User = Depends(require_client)):
    return db.execute(select(QuoteRequest).where(QuoteRequest.client_id == user.client_id)
                      .order_by(QuoteRequest.created_at.desc())).scalars().all()


@router.post("/requests", response_model=QuoteRequestOut, status_code=201)
def new_request(data: QuoteRequestIn, request: Request, db: Session = Depends(get_db), user: User = Depends(require_client)):
    req = QuoteRequest(client_id=user.client_id, name=data.name, phone=data.phone, email=data.email or user.email,
                       service=data.service, address=data.address, message=data.message, status="new")
    db.add(req)
    db.flush()
    log_activity(db, user, "request.created", "request", req.id, summary=req.name, ip=client_ip(request))
    notify_permission(db, "requests.view", "request.created", {"name": req.name, "service": req.service}, "/requests")
    db.commit()
    return req
