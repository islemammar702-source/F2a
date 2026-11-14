"""Financial aggregations.

Important distinctions:
  * invoiced  = chiffre d'affaires facturé (sum of non-cancelled invoices issued in the period, TTC + timbre)
  * collected = encaissements (sum of VALID payments dated in the period)
  * outstanding = montants restant à recevoir (current balance of open invoices)
No profit is computed: costs are not tracked by the application.
"""
import io
from datetime import date, timedelta

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Client, Invoice, Payment
from app.services.calculations import r3

OPEN = ("unpaid", "partial", "overdue")


def resolve_period(period: str | None, date_from: date | None, date_to: date | None) -> tuple[date, date]:
    today = date.today()
    if period == "today":
        return today, today
    if period == "week":
        start = today - timedelta(days=today.weekday())
        return start, start + timedelta(days=6)
    if period == "month":
        start = today.replace(day=1)
        nxt = (start + timedelta(days=32)).replace(day=1)
        return start, nxt - timedelta(days=1)
    if period == "custom" and date_from and date_to:
        return (date_from, date_to) if date_from <= date_to else (date_to, date_from)
    if date_from and date_to:
        return date_from, date_to
    return today.replace(month=1, day=1), today.replace(month=12, day=31)  # year (default)


def month_range(d_from: date, d_to: date) -> list[str]:
    out, cur = [], d_from.replace(day=1)
    while cur <= d_to and len(out) < 60:
        out.append(cur.strftime("%Y-%m"))
        cur = (cur + timedelta(days=32)).replace(day=1)
    return out


def summary(db: Session, d_from: date, d_to: date) -> dict:
    invoiced = db.execute(select(func.coalesce(func.sum(Invoice.total_due), 0), func.count()).where(
        Invoice.status != "cancelled", Invoice.issue_date.between(d_from, d_to))).one()
    collected = db.execute(select(func.coalesce(func.sum(Payment.amount), 0), func.count()).where(
        Payment.status == "valid", Payment.payment_date.between(d_from, d_to))).one()
    outstanding = db.execute(select(func.coalesce(func.sum(Invoice.balance), 0), func.count()).where(
        Invoice.status.in_(OPEN))).one()
    overdue = db.execute(select(func.coalesce(func.sum(Invoice.balance), 0), func.count()).where(
        Invoice.status == "overdue")).one()
    return {
        "invoiced": r3(invoiced[0]), "invoice_count": invoiced[1],
        "collected": r3(collected[0]), "payment_count": collected[1],
        "outstanding": r3(outstanding[0]), "open_invoice_count": outstanding[1],
        "overdue": r3(overdue[0]), "overdue_count": overdue[1],
    }


def by_month(db: Session, d_from: date, d_to: date) -> list[dict]:
    inv_m = func.to_char(Invoice.issue_date, "YYYY-MM")
    pay_m = func.to_char(Payment.payment_date, "YYYY-MM")
    inv = dict(db.execute(select(inv_m, func.sum(Invoice.total_due)).where(
        Invoice.status != "cancelled", Invoice.issue_date.between(d_from, d_to)).group_by(inv_m)).all())
    pay = dict(db.execute(select(pay_m, func.sum(Payment.amount)).where(
        Payment.status == "valid", Payment.payment_date.between(d_from, d_to)).group_by(pay_m)).all())
    return [{"month": m, "invoiced": r3(inv.get(m, 0)), "collected": r3(pay.get(m, 0))} for m in month_range(d_from, d_to)]


def by_client(db: Session, d_from: date, d_to: date, limit: int = 50) -> list[dict]:
    inv = select(Invoice.client_id.label("cid"), func.sum(Invoice.total_due).label("invoiced")).where(
        Invoice.status != "cancelled", Invoice.issue_date.between(d_from, d_to)).group_by(Invoice.client_id).subquery()
    pay = select(Payment.client_id.label("cid"), func.sum(Payment.amount).label("collected")).where(
        Payment.status == "valid", Payment.payment_date.between(d_from, d_to)).group_by(Payment.client_id).subquery()
    bal = select(Invoice.client_id.label("cid"), func.sum(Invoice.balance).label("balance")).where(
        Invoice.status.in_(OPEN)).group_by(Invoice.client_id).subquery()
    rows = db.execute(
        select(Client.id, Client.name, inv.c.invoiced, pay.c.collected, bal.c.balance)
        .outerjoin(inv, inv.c.cid == Client.id).outerjoin(pay, pay.c.cid == Client.id).outerjoin(bal, bal.c.cid == Client.id)
        .where((inv.c.invoiced.isnot(None)) | (pay.c.collected.isnot(None)) | (bal.c.balance.isnot(None)))
        .order_by(func.coalesce(inv.c.invoiced, 0).desc()).limit(limit)
    ).all()
    return [{"client_id": str(cid), "name": n, "invoiced": r3(i or 0), "collected": r3(c or 0), "balance": r3(b or 0)}
            for cid, n, i, c, b in rows]


def by_method(db: Session, d_from: date, d_to: date) -> list[dict]:
    rows = db.execute(select(Payment.method, func.count(), func.sum(Payment.amount)).where(
        Payment.status == "valid", Payment.payment_date.between(d_from, d_to)).group_by(Payment.method)).all()
    return [{"method": m, "count": c, "amount": r3(a)} for m, c, a in rows]


def unpaid(db: Session, limit: int = 200) -> list[dict]:
    rows = db.execute(select(Invoice).where(Invoice.status.in_(OPEN)).order_by(Invoice.due_date).limit(limit)).unique().scalars()
    today = date.today()
    return [{"id": str(i.id), "number": i.number, "client": i.client.name, "client_id": str(i.client_id),
             "issue_date": i.issue_date, "due_date": i.due_date, "status": i.status, "total_due": i.total_due,
             "amount_paid": i.amount_paid, "balance": i.balance,
             "days_late": max(0, (today - i.due_date).days)} for i in rows]


def full_report(db: Session, d_from: date, d_to: date) -> dict:
    return {"date_from": d_from, "date_to": d_to, "summary": summary(db, d_from, d_to), "by_month": by_month(db, d_from, d_to),
            "by_client": by_client(db, d_from, d_to), "by_method": by_method(db, d_from, d_to), "unpaid": unpaid(db)}


def report_xlsx(report: dict, method_label) -> bytes:
    wb = Workbook()
    head_font = Font(bold=True, color="FFFFFF")
    head_fill = PatternFill("solid", fgColor="174B83")
    money_fmt = '#,##0.000 "DT"'

    def sheet(ws, title, headers, rows, money_cols=()):
        ws.title = title
        ws.append(headers)
        for c in ws[1]:
            c.font, c.fill, c.alignment = head_font, head_fill, Alignment(horizontal="center")
        for r in rows:
            ws.append(r)
        for col in money_cols:
            for row in ws.iter_rows(min_row=2, min_col=col, max_col=col):
                for c in row:
                    c.number_format = money_fmt
        for col in ws.columns:
            ws.column_dimensions[col[0].column_letter].width = max(14, min(45, max(len(str(c.value or "")) for c in col) + 2))

    s = report["summary"]
    ws = wb.active
    sheet(ws, "Synthèse", ["Indicateur", "Valeur"], [
        ["Période", f"{report['date_from']} → {report['date_to']}"],
        ["Chiffre d'affaires facturé (TTC)", float(s["invoiced"])],
        ["Nombre de factures", s["invoice_count"]],
        ["Montants encaissés", float(s["collected"])],
        ["Nombre de paiements", s["payment_count"]],
        ["Montants restant à recevoir", float(s["outstanding"])],
        ["Dont en retard", float(s["overdue"])],
        ["Note", "CA facturé ≠ encaissements ≠ bénéfice. Aucun bénéfice n'est calculé."],
    ])
    for r in range(3, 8):
        if r not in (4, 6):
            ws.cell(r, 2).number_format = money_fmt
    sheet(wb.create_sheet(), "Par mois", ["Mois", "Facturé", "Encaissé"],
          [[m["month"], float(m["invoiced"]), float(m["collected"])] for m in report["by_month"]], (2, 3))
    sheet(wb.create_sheet(), "Par client", ["Client", "Facturé", "Encaissé", "Solde"],
          [[c["name"], float(c["invoiced"]), float(c["collected"]), float(c["balance"])] for c in report["by_client"]], (2, 3, 4))
    sheet(wb.create_sheet(), "Par mode", ["Mode", "Nombre", "Montant"],
          [[method_label(m["method"]), m["count"], float(m["amount"])] for m in report["by_method"]], (3,))
    sheet(wb.create_sheet(), "Impayés", ["Facture", "Client", "Émission", "Échéance", "Statut", "Total", "Payé", "Reste", "Jours de retard"],
          [[i["number"], i["client"], i["issue_date"], i["due_date"], i["status"], float(i["total_due"]),
            float(i["amount_paid"]), float(i["balance"]), i["days_late"]] for i in report["unpaid"]], (6, 7, 8))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
