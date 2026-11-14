"""Dashboard, financial reports, global search, notifications and activity log."""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app.api.routes.invoices import mark_overdue
from app.core.deps import get_current_user, require_permission, require_staff
from app.db.session import get_db
from app.models import ActivityLog, Client, Invoice, Notification, Payment, Quote, User
from app.schemas.sales import InvoiceListItem, PaymentOut, QuoteListItem
from app.schemas.system import ActivityOut, NotificationOut
from app.services import reports as rep
from app.services.calculations import r3
from app.services.pdf import method_label, render_report_pdf
from app.services.settings_service import get_company_settings
from app.services.storage import logo_path

router = APIRouter(tags=["dashboard"])

PERIOD = Query(None, pattern="^(today|week|month|year|custom)$")


@router.get("/dashboard")
def dashboard(period: str | None = PERIOD, date_from: date | None = None, date_to: date | None = None,
              db: Session = Depends(get_db), user: User = Depends(require_permission("dashboard.view"))):
    mark_overdue(db)
    d_from, d_to = rep.resolve_period(period or "year", date_from, date_to)
    perms = user.permission_codes

    quotes = dict(db.execute(select(Quote.status, func.count()).where(Quote.issue_date.between(d_from, d_to))
                             .group_by(Quote.status)).all())
    invoices = dict(db.execute(select(Invoice.status, func.count()).where(Invoice.issue_date.between(d_from, d_to))
                               .group_by(Invoice.status)).all())
    s = rep.summary(db, d_from, d_to)
    stats = {
        "clients": db.execute(select(func.count()).select_from(Client).where(Client.is_archived.is_(False))).scalar_one(),
        "quotes": sum(quotes.values()), "quotes_pending": quotes.get("sent", 0), "quotes_accepted": quotes.get("accepted", 0),
        "quotes_draft": quotes.get("draft", 0), "quotes_refused": quotes.get("refused", 0),
        "invoices": sum(v for k, v in invoices.items() if k != "cancelled"), "invoices_paid": invoices.get("paid", 0),
        "invoices_partial": invoices.get("partial", 0),
        "invoices_unpaid": invoices.get("unpaid", 0) + invoices.get("overdue", 0),
        "invoices_overdue": invoices.get("overdue", 0),
        "total_invoiced": s["invoiced"], "total_collected": s["collected"], "total_outstanding": s["outstanding"],
    }
    # last 12 months chart (independent of the filter) + period chart
    today = date.today()
    start12 = (today.replace(day=1) - timedelta(days=330)).replace(day=1)
    out = {
        "period": {"from": d_from, "to": d_to},
        "stats": stats,
        "monthly": rep.by_month(db, start12, today),
        "payments_by_method": rep.by_method(db, d_from, d_to),
    }
    if "quotes.view" in perms:
        out["recent_quotes"] = [QuoteListItem.model_validate(q) for q in db.execute(
            select(Quote).order_by(Quote.created_at.desc()).limit(6)).unique().scalars()]
    if "invoices.view" in perms:
        out["recent_invoices"] = [InvoiceListItem.model_validate(i) for i in db.execute(
            select(Invoice).order_by(Invoice.created_at.desc()).limit(6)).unique().scalars()]
    if "payments.view" in perms:
        out["recent_payments"] = [PaymentOut.model_validate(p) for p in db.execute(
            select(Payment).order_by(Payment.created_at.desc()).limit(6)).unique().scalars()]
    if "activity.view" in perms:
        rows = db.execute(select(ActivityLog, User.full_name).outerjoin(User, User.id == ActivityLog.user_id)
                          .where(ActivityLog.action.notlike("auth.%")).order_by(ActivityLog.created_at.desc()).limit(10)).all()
        out["activity"] = [ActivityOut.model_validate(a).model_copy(update={"user_name": n}) for a, n in rows]
    return out


@router.get("/reports")
def reports(period: str | None = PERIOD, date_from: date | None = None, date_to: date | None = None,
            db: Session = Depends(get_db), _: User = Depends(require_permission("reports.view"))):
    mark_overdue(db)
    d_from, d_to = rep.resolve_period(period, date_from, date_to)
    return rep.full_report(db, d_from, d_to)


@router.get("/reports/export")
def export_report(format: str = Query("pdf", pattern="^(pdf|xlsx)$"), lang: str = Query("fr", pattern="^(fr|ar)$"),
                  period: str | None = PERIOD, date_from: date | None = None, date_to: date | None = None,
                  db: Session = Depends(get_db), _: User = Depends(require_permission("reports.view"))):
    d_from, d_to = rep.resolve_period(period, date_from, date_to)
    report = rep.full_report(db, d_from, d_to)
    cs = get_company_settings(db)
    name = f"rapport-{d_from}-{d_to}"
    if format == "xlsx":
        data = rep.report_xlsx(report, lambda code: method_label(cs, code, "fr"))
        return Response(data, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        headers={"Content-Disposition": f'attachment; filename="{name}.xlsx"'})
    data = render_report_pdf(report, cs, lang, logo_path(db, cs))
    return Response(data, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{name}.pdf"'})


@router.get("/search")
def global_search(q: str = Query(min_length=2, max_length=100), db: Session = Depends(get_db),
                  user: User = Depends(require_staff)):
    like = f"%{q.strip()}%"
    perms = user.permission_codes
    out: dict = {"clients": [], "quotes": [], "invoices": []}
    if "clients.view" in perms:
        out["clients"] = [{"id": str(c.id), "label": c.name, "sub": c.phone or c.email or ""} for c in db.execute(
            select(Client).where(or_(Client.name.ilike(like), Client.phone.ilike(like), Client.email.ilike(like)))
            .limit(6)).scalars()]
    if "quotes.view" in perms:
        out["quotes"] = [{"id": str(x.id), "label": x.number, "sub": x.client.name} for x in db.execute(
            select(Quote).join(Client).where(or_(Quote.number.ilike(like), Quote.title.ilike(like), Client.name.ilike(like)))
            .limit(6)).unique().scalars()]
    if "invoices.view" in perms:
        out["invoices"] = [{"id": str(x.id), "label": x.number, "sub": x.client.name} for x in db.execute(
            select(Invoice).join(Client).where(or_(Invoice.number.ilike(like), Invoice.title.ilike(like), Client.name.ilike(like)))
            .limit(6)).unique().scalars()]
    return out


@router.get("/notifications")
def list_notifications(unread_only: bool = False, limit: int = Query(30, ge=1, le=100), db: Session = Depends(get_db),
                       user: User = Depends(get_current_user)):
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    items = db.execute(stmt.order_by(Notification.created_at.desc()).limit(limit)).scalars().all()
    unread = db.execute(select(func.count()).select_from(Notification).where(
        Notification.user_id == user.id, Notification.is_read.is_(False))).scalar_one()
    return {"items": [NotificationOut.model_validate(n) for n in items], "unread": unread}


@router.post("/notifications/read", status_code=204)
def mark_read(ids: list[str] | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    stmt = update(Notification).where(Notification.user_id == user.id)
    if ids:
        stmt = stmt.where(Notification.id.in_(ids))
    db.execute(stmt.values(is_read=True))
    db.commit()


@router.get("/activity")
def activity(entity_type: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(30, ge=1, le=100),
             db: Session = Depends(get_db), _: User = Depends(require_permission("activity.view"))):
    stmt = select(ActivityLog, User.full_name).outerjoin(User, User.id == ActivityLog.user_id)
    if entity_type:
        stmt = stmt.where(ActivityLog.entity_type == entity_type)
    total = db.execute(select(func.count()).select_from(ActivityLog)).scalar_one()
    rows = db.execute(stmt.order_by(ActivityLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [ActivityOut.model_validate(a).model_copy(update={"user_name": n}) for a, n in rows], "total": total,
            "page": page, "page_size": page_size}


@router.get("/stats/balance")
def balance_check(db: Session = Depends(get_db), _: User = Depends(require_permission("reports.view"))):
    """Integrity check: stored balances must equal total_due - Σ valid payments."""
    rows = db.execute(select(Invoice.id, Invoice.number, Invoice.total_due, Invoice.balance,
                             func.coalesce(func.sum(Payment.amount).filter(Payment.status == "valid"), 0))
                      .outerjoin(Payment, Payment.invoice_id == Invoice.id).group_by(Invoice.id)).all()
    bad = [n for _, n, td, b, p in rows if r3(td - p) != r3(b)]
    return {"checked": len(rows), "inconsistent": bad}
