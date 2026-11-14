"""Payments: append-only. Cancellation keeps the record and is fully traced."""
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.deps import client_ip, require_permission
from app.db.session import get_db
from app.models import Client, Invoice, Payment, User
from app.schemas.common import Page
from app.schemas.sales import CancelIn, PaymentIn, PaymentOut
from app.schemas.system import DocumentOut
from app.services.audit import log_activity, notify_client_users, notify_permission
from app.services.calculations import r3
from app.services.numbering import next_number
from app.services.sales import bad_request, lock_invoice, recompute_invoice
from app.services.settings_service import get_company_settings
from app.services.storage import save_upload

router = APIRouter(prefix="/payments", tags=["payments"])


@router.get("", response_model=Page[PaymentOut])
def list_payments(
    q: str | None = None, method: str | None = None, status: str | None = None,
    client_id: uuid.UUID | None = None, invoice_id: uuid.UUID | None = None,
    date_from: date | None = None, date_to: date | None = None,
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db), _: User = Depends(require_permission("payments.view")),
):
    stmt = select(Payment).join(Invoice, Invoice.id == Payment.invoice_id).join(Client, Client.id == Payment.client_id)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Payment.number.ilike(like), Payment.reference.ilike(like), Invoice.number.ilike(like),
                              Client.name.ilike(like)))
    if method:
        stmt = stmt.where(Payment.method == method)
    if status:
        stmt = stmt.where(Payment.status == status)
    if client_id:
        stmt = stmt.where(Payment.client_id == client_id)
    if invoice_id:
        stmt = stmt.where(Payment.invoice_id == invoice_id)
    if date_from:
        stmt = stmt.where(Payment.payment_date >= date_from)
    if date_to:
        stmt = stmt.where(Payment.payment_date <= date_to)
    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = db.execute(stmt.order_by(Payment.payment_date.desc(), Payment.number.desc())
                      .offset((page - 1) * page_size).limit(page_size)).unique().scalars().all()
    return Page(items=rows, total=total, page=page, page_size=page_size)


@router.get("/summary")
def payments_summary(date_from: date | None = None, date_to: date | None = None, db: Session = Depends(get_db),
                     _: User = Depends(require_permission("payments.view"))):
    stmt = select(Payment.method, func.count(), func.coalesce(func.sum(Payment.amount), 0)).where(Payment.status == "valid")
    if date_from:
        stmt = stmt.where(Payment.payment_date >= date_from)
    if date_to:
        stmt = stmt.where(Payment.payment_date <= date_to)
    rows = db.execute(stmt.group_by(Payment.method)).all()
    by_method = [{"method": m, "count": c, "amount": r3(a)} for m, c, a in rows]
    return {"total": r3(sum(x["amount"] for x in by_method)), "count": sum(x["count"] for x in by_method),
            "by_method": by_method}


@router.post("/proof", response_model=DocumentOut, status_code=201)
async def upload_proof(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db),
                       actor: User = Depends(require_permission("payments.manage"))):
    doc = await save_upload(db, file, kind="payment_proof", user_id=actor.id)
    log_activity(db, actor, "document.uploaded", "document", doc.id, summary=doc.filename, ip=client_ip(request))
    db.commit()
    return doc


@router.post("", response_model=PaymentOut, status_code=201)
def create_payment(data: PaymentIn, request: Request, db: Session = Depends(get_db),
                   actor: User = Depends(require_permission("payments.manage"))):
    """Runs in a single transaction with the invoice row locked (no double-spend on the balance)."""
    inv = lock_invoice(db, data.invoice_id)
    if inv.status == "cancelled":
        raise bad_request("invoice_cancelled")
    cs = get_company_settings(db)
    methods = {m["code"] for m in cs.payment_methods if m.get("active", True)}
    if data.method not in methods:
        raise bad_request("invalid_payment_method")
    amount = r3(data.amount)
    recompute_invoice(db, inv)
    if amount > inv.balance:
        raise bad_request("amount_exceeds_balance")
    pay_date = data.payment_date or date.today()
    if pay_date > date.today():
        raise bad_request("payment_date_in_future")
    if data.proof_document_id:
        from app.models import Document
        doc = db.get(Document, data.proof_document_id)
        if doc is None or doc.kind != "payment_proof":
            raise bad_request("invalid_proof")
        doc.client_id = inv.client_id
    pay = Payment(number=next_number(db, "payment", pay_date), invoice_id=inv.id, client_id=inv.client_id,
                  amount=amount, payment_date=pay_date, method=data.method, reference=data.reference,
                  comment=data.comment, proof_document_id=data.proof_document_id, status="valid", created_by_id=actor.id)
    db.add(pay)
    db.flush()
    if data.proof_document_id:
        doc.entity_type, doc.entity_id = "payment", pay.id
    recompute_invoice(db, inv)
    log_activity(db, actor, "payment.created", "payment", pay.id, summary=f"{pay.number} – {inv.number}",
                 ip=client_ip(request), details={"amount": str(amount), "invoice": inv.number, "balance": str(inv.balance)})
    notify_permission(db, "payments.view", "payment.created",
                      {"number": pay.number, "invoice": inv.number, "amount": str(amount), "client": inv.client.name},
                      f"/invoices/{inv.id}", exclude_user_id=actor.id)
    notify_client_users(db, inv.client_id, "payment.received", {"invoice": inv.number, "amount": str(amount)},
                        "/portal/payments")
    db.commit()
    db.refresh(pay)
    return pay


@router.get("/{payment_id}", response_model=PaymentOut)
def get_payment(payment_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require_permission("payments.view"))):
    pay = db.get(Payment, payment_id)
    if pay is None:
        raise HTTPException(404, detail="not_found")
    return pay


@router.post("/{payment_id}/cancel", response_model=PaymentOut)
def cancel_payment(payment_id: uuid.UUID, data: CancelIn, request: Request, db: Session = Depends(get_db),
                   actor: User = Depends(require_permission("payments.manage"))):
    pay = db.get(Payment, payment_id)
    if pay is None:
        raise HTTPException(404, detail="not_found")
    inv = lock_invoice(db, pay.invoice_id)
    pay = db.execute(select(Payment).where(Payment.id == payment_id).with_for_update(of=Payment)
                     .execution_options(populate_existing=True)).unique().scalar_one()
    if pay.status != "valid":
        raise bad_request("payment_already_cancelled")
    pay.status = "cancelled"
    pay.cancelled_at = datetime.now(timezone.utc)
    pay.cancelled_by_id = actor.id
    pay.cancel_reason = data.reason
    db.flush()
    recompute_invoice(db, inv)
    log_activity(db, actor, "payment.cancelled", "payment", pay.id, summary=f"{pay.number} – {inv.number}",
                 ip=client_ip(request), details={"amount": str(pay.amount), "reason": data.reason,
                                                 "balance": str(inv.balance)})
    db.commit()
    db.refresh(pay)
    return pay
