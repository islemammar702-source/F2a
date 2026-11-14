"""Clients CRM."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.deps import client_ip, require_permission
from app.db.session import get_db
from app.models import Client, Document, Invoice, Payment, Quote, User
from app.schemas.clients import ClientCreate, ClientListItem, ClientOut, ClientUpdate
from app.schemas.common import Page
from app.schemas.sales import InvoiceListItem, PaymentOut, QuoteListItem
from app.schemas.system import DocumentOut
from app.services.audit import log_activity, notify_permission
from app.services.calculations import r3

router = APIRouter(prefix="/clients", tags=["clients"])


def _invoice_totals_subq():
    return (
        select(
            Invoice.client_id.label("cid"),
            func.coalesce(func.sum(Invoice.total_due), 0).label("invoiced"),
            func.coalesce(func.sum(Invoice.balance), 0).label("balance"),
        )
        .where(Invoice.status != "cancelled")
        .group_by(Invoice.client_id)
        .subquery()
    )


@router.get("", response_model=Page[ClientListItem])
def list_clients(
    q: str | None = None, client_type: str | None = None, archived: bool = False, with_balance: bool | None = None,
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db), _: User = Depends(require_permission("clients.view")),
):
    sub = _invoice_totals_subq()
    stmt = select(Client, sub.c.invoiced, sub.c.balance).outerjoin(sub, sub.c.cid == Client.id).where(
        Client.is_archived.is_(archived))
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Client.name.ilike(like), Client.phone.ilike(like), Client.email.ilike(like),
                              Client.tax_id.ilike(like), Client.city.ilike(like), Client.contact_name.ilike(like)))
    if client_type:
        stmt = stmt.where(Client.client_type == client_type)
    if with_balance:
        stmt = stmt.where(sub.c.balance > 0)
    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = db.execute(stmt.order_by(Client.name).offset((page - 1) * page_size).limit(page_size)).all()
    items = [
        ClientListItem.model_validate(c).model_copy(update={"total_invoiced": r3(inv or 0), "balance": r3(bal or 0)})
        for c, inv, bal in rows
    ]
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=ClientOut, status_code=201)
def create_client(data: ClientCreate, request: Request, db: Session = Depends(get_db),
                  actor: User = Depends(require_permission("clients.manage"))):
    client = Client(**data.model_dump(), created_by_id=actor.id)
    db.add(client)
    db.flush()
    log_activity(db, actor, "client.created", "client", client.id, summary=client.name, ip=client_ip(request))
    notify_permission(db, "clients.view", "client.created", {"name": client.name}, f"/clients/{client.id}",
                      exclude_user_id=actor.id)
    db.commit()
    return client


@router.get("/{client_id}")
def get_client(client_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_permission("clients.view"))):
    client = db.get(Client, client_id)
    if client is None:
        raise HTTPException(404, detail="not_found")
    perms = user.permission_codes
    out: dict = {"client": ClientOut.model_validate(client)}
    if "quotes.view" in perms:
        quotes = db.execute(select(Quote).where(Quote.client_id == client_id).order_by(Quote.issue_date.desc())).scalars()
        out["quotes"] = [QuoteListItem.model_validate(q) for q in quotes]
    if "invoices.view" in perms:
        invs = db.execute(select(Invoice).where(Invoice.client_id == client_id).order_by(Invoice.issue_date.desc())).unique().scalars()
        out["invoices"] = [InvoiceListItem.model_validate(i) for i in invs]
    if "payments.view" in perms:
        pays = db.execute(select(Payment).where(Payment.client_id == client_id).order_by(Payment.payment_date.desc())).scalars()
        out["payments"] = [PaymentOut.model_validate(p) for p in pays]
    docs = db.execute(select(Document).where(Document.client_id == client_id).order_by(Document.created_at.desc())).scalars()
    out["documents"] = [DocumentOut.model_validate(d) for d in docs]
    tot = db.execute(select(
        func.coalesce(func.sum(Invoice.total_due), 0), func.coalesce(func.sum(Invoice.amount_paid), 0),
        func.coalesce(func.sum(Invoice.balance), 0)).where(Invoice.client_id == client_id, Invoice.status != "cancelled")).one()
    out["totals"] = {"invoiced": r3(tot[0]), "paid": r3(tot[1]), "balance": r3(tot[2])}
    return out


@router.patch("/{client_id}", response_model=ClientOut)
def update_client(client_id: uuid.UUID, data: ClientUpdate, request: Request, db: Session = Depends(get_db),
                  actor: User = Depends(require_permission("clients.manage"))):
    client = db.get(Client, client_id)
    if client is None:
        raise HTTPException(404, detail="not_found")
    payload = data.model_dump(exclude_unset=True)
    for k, v in payload.items():
        if k == "name" and not v:
            continue
        setattr(client, k, v)
    log_activity(db, actor, "client.updated", "client", client.id, summary=client.name, ip=client_ip(request),
                 details={"fields": sorted(payload)})
    db.commit()
    return client


@router.post("/{client_id}/archive", response_model=ClientOut)
def archive_client(client_id: uuid.UUID, request: Request, archived: bool = True, db: Session = Depends(get_db),
                   actor: User = Depends(require_permission("clients.manage"))):
    client = db.get(Client, client_id)
    if client is None:
        raise HTTPException(404, detail="not_found")
    client.is_archived = archived
    log_activity(db, actor, "client.archived" if archived else "client.restored", "client", client.id,
                 summary=client.name, ip=client_ip(request))
    db.commit()
    return client
