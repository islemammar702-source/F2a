"""Clients, quotes, invoices, payments, PDFs and reports (API tests)."""
from datetime import date, timedelta
from decimal import Decimal as D

from sqlalchemy import update

from app.db.session import SessionLocal
from app.models import Invoice
from tests.conftest import LINES, make_client, make_invoice, make_quote

Y = date.today().year


def money(v) -> D:
    return D(str(v)).quantize(D("0.001"))


# ---------------- Clients ----------------
def test_client_crud_search_archive(client, manager):
    c = make_client(client, manager, "Résidence Les Pins", client_type="company", tax_id="1234567/A")
    assert c["client_type"] == "company"
    r = client.patch(f"/api/clients/{c['id']}", json={"phone": "+216 99 999 999", "notes": "VIP"}, headers=manager)
    assert r.json()["phone"] == "+216 99 999 999"
    assert client.get("/api/clients?q=pins", headers=manager).json()["total"] == 1
    assert client.get("/api/clients?client_type=individual", headers=manager).json()["total"] == 0
    client.post(f"/api/clients/{c['id']}/archive", headers=manager)
    assert client.get("/api/clients", headers=manager).json()["total"] == 0
    assert client.get("/api/clients?archived=true", headers=manager).json()["total"] == 1
    # cannot create a quote for an archived client
    r = client.post("/api/quotes", json={"client_id": c["id"], "title": "Titre", "items": LINES}, headers=manager)
    assert r.status_code == 400 and r.json()["detail"] == "client_archived"
    detail = client.get(f"/api/clients/{c['id']}", headers=manager).json()
    assert {"client", "quotes", "invoices", "payments", "documents", "totals"} <= set(detail)


def test_client_validation(client, manager):
    r = client.post("/api/clients", json={"name": "X", "email": "not-an-email"}, headers=manager)
    assert r.status_code == 422


# ---------------- Quotes ----------------
def test_quote_numbering_and_server_side_totals(client, manager):
    c = make_client(client, manager)
    tampered = [dict(LINES[0], total_ht="1", total_ttc="1")]  # client-side totals are ignored
    q1 = make_quote(client, manager, c["id"], lines=tampered)
    q2 = make_quote(client, manager, c["id"])
    assert q1["number"] == f"DEV-{Y}-001"
    assert q2["number"] == f"DEV-{Y}-002"
    assert money(q1["total_ht"]) == D("1850.000") and money(q1["total_ttc"]) == D("2201.500")
    assert money(q2["subtotal_ht"]) == D("2830.000")
    assert money(q2["total_discount"]) == D("80.000")
    assert money(q2["total_ht"]) == D("2750.000")
    assert money(q2["total_tva"]) == D("510.500")
    assert money(q2["total_ttc"]) == D("3260.500")
    assert q2["status"] == "draft"


def test_quote_invalid_lines(client, manager):
    c = make_client(client, manager)
    bad = [dict(LINES[0], discount="5000")]
    r = client.post("/api/quotes", json={"client_id": c["id"], "title": "Titre", "items": bad}, headers=manager)
    assert r.status_code == 400 and r.json()["detail"] == "discount_exceeds_amount"
    r = client.post("/api/quotes", json={"client_id": c["id"], "title": "Titre", "items": []}, headers=manager)
    assert r.status_code == 422


def test_quote_workflow_duplicate_and_conversion(client, manager):
    c = make_client(client, manager)
    q = make_quote(client, manager, c["id"])
    # cannot convert a draft
    assert client.post(f"/api/invoices/from-quote/{q['id']}", json={}, headers=manager).json()["detail"] == "quote_not_accepted"
    # invalid transition draft -> accepted
    assert client.post(f"/api/quotes/{q['id']}/status", json={"status": "accepted"}, headers=manager).status_code == 400
    r = client.post(f"/api/quotes/{q['id']}/send", json={"channel": "whatsapp"}, headers=manager)
    assert r.json()["status"] == "sent"
    r = client.post(f"/api/quotes/{q['id']}/status", json={"status": "accepted"}, headers=manager)
    assert r.json()["status"] == "accepted"
    # accepted quotes are locked
    upd = {"client_id": c["id"], "title": "changed", "items": LINES}
    assert client.put(f"/api/quotes/{q['id']}", json=upd, headers=manager).status_code == 400
    dup = client.post(f"/api/quotes/{q['id']}/duplicate", headers=manager).json()
    assert dup["status"] == "draft" and dup["number"] == f"DEV-{Y}-002" and len(dup["items"]) == 3

    inv = client.post(f"/api/invoices/from-quote/{q['id']}", json={}, headers=manager)
    assert inv.status_code == 201
    inv = inv.json()
    assert inv["number"] == f"FAC-{Y}-001"
    assert inv["quote"]["number"] == q["number"]
    assert money(inv["total_ttc"]) == money(q["total_ttc"])
    assert money(inv["stamp_duty"]) == D("1.000")
    assert money(inv["total_due"]) == D("3261.500")
    assert inv["status"] == "unpaid"
    # no double conversion
    assert client.post(f"/api/invoices/from-quote/{q['id']}", json={}, headers=manager).status_code == 409
    assert client.get(f"/api/quotes/{q['id']}", headers=manager).json()["invoice_number"] == inv["number"]


def test_quote_edit_recomputes(client, manager):
    c = make_client(client, manager)
    q = make_quote(client, manager, c["id"])
    lines = [dict(LINES[0], quantity="2")]
    r = client.put(f"/api/quotes/{q['id']}", json={"client_id": c["id"], "title": "Nouveau", "items": lines}, headers=manager)
    assert r.status_code == 200
    assert money(r.json()["total_ttc"]) == D("4403.000") and r.json()["number"] == q["number"]


def test_quote_expiry(client, manager):
    c = make_client(client, manager)
    past = date.today() - timedelta(days=40)
    q = make_quote(client, manager, c["id"], issue_date=str(past), validity_date=str(past + timedelta(days=10)))
    client.post(f"/api/quotes/{q['id']}/status", json={"status": "sent"}, headers=manager)
    assert client.get(f"/api/quotes/{q['id']}", headers=manager).json()["status"] == "expired"


# ---------------- Invoices & payments ----------------
def _invoice_2500(client, headers, cid, **kw):
    lines = [{"designation": "Forfait", "quantity": "1", "unit": "u", "unit_price_ht": "2500", "tva_rate": "0"}]
    return make_invoice(client, headers, cid, lines=lines, apply_stamp_duty=False, **kw)


def test_multiple_payments_and_balance(client, admin):
    """Spec example: invoice 2 500 DT, payments 1 000 + 500 + 300 → 700 DT remaining."""
    c = make_client(client, admin)
    inv = _invoice_2500(client, admin, c["id"])
    assert money(inv["total_due"]) == D("2500.000") and inv["status"] == "unpaid"
    for amount in ("1000", "500", "300"):
        r = client.post("/api/payments", json={"invoice_id": inv["id"], "amount": amount, "method": "cash"}, headers=admin)
        assert r.status_code == 201, r.text
    inv = client.get(f"/api/invoices/{inv['id']}", headers=admin).json()
    assert money(inv["amount_paid"]) == D("1800.000")
    assert money(inv["balance"]) == D("700.000")
    assert inv["status"] == "partial"
    assert [p["number"] for p in inv["payments"]] == [f"PAY-{Y}-001", f"PAY-{Y}-002", f"PAY-{Y}-003"]
    # overpayment refused
    r = client.post("/api/payments", json={"invoice_id": inv["id"], "amount": "700.001", "method": "cash"}, headers=admin)
    assert r.status_code == 400 and r.json()["detail"] == "amount_exceeds_balance"
    # unknown method refused
    r = client.post("/api/payments", json={"invoice_id": inv["id"], "amount": "1", "method": "bitcoin"}, headers=admin)
    assert r.json()["detail"] == "invalid_payment_method"
    r = client.post("/api/payments", json={"invoice_id": inv["id"], "amount": "700", "method": "transfer",
                                           "reference": "VIR-123"}, headers=admin)
    assert r.status_code == 201
    inv = client.get(f"/api/invoices/{inv['id']}", headers=admin).json()
    assert inv["status"] == "paid" and money(inv["balance"]) == 0


def test_payment_cancellation_is_traced(client, accountant, admin):
    c = make_client(client, admin)
    inv = _invoice_2500(client, admin, c["id"])
    p = client.post("/api/payments", json={"invoice_id": inv["id"], "amount": "1000", "method": "check"},
                    headers=accountant).json()
    r = client.post(f"/api/payments/{p['id']}/cancel", json={"reason": "Chèque rejeté"}, headers=accountant)
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert client.post(f"/api/payments/{p['id']}/cancel", json={"reason": "again"}, headers=accountant).status_code == 400
    inv = client.get(f"/api/invoices/{inv['id']}", headers=accountant).json()
    assert money(inv["balance"]) == D("2500.000") and inv["status"] == "unpaid"
    # history kept: the payment still exists with its cancellation data
    pays = client.get(f"/api/payments?invoice_id={inv['id']}", headers=accountant).json()["items"]
    assert len(pays) == 1 and pays[0]["cancel_reason"] == "Chèque rejeté"
    hist = client.get(f"/api/invoices/{inv['id']}/history", headers=accountant).json()
    assert {"payment.created", "payment.cancelled"} <= {h["action"] for h in hist}
    # no DELETE endpoint on payments
    assert client.delete(f"/api/payments/{p['id']}", headers=admin).status_code == 405


def test_invoice_edit_rules(client, admin):
    c = make_client(client, admin)
    inv = make_invoice(client, admin, c["id"])
    r = client.patch(f"/api/invoices/{inv['id']}", json={"items": [LINES[0]]}, headers=admin)
    assert r.status_code == 200 and money(r.json()["total_ttc"]) == D("2201.500")
    client.post("/api/payments", json={"invoice_id": inv["id"], "amount": "100", "method": "cash"}, headers=admin)
    r = client.patch(f"/api/invoices/{inv['id']}", json={"items": LINES}, headers=admin)
    assert r.status_code == 400 and r.json()["detail"] == "invoice_has_payments"
    assert client.patch(f"/api/invoices/{inv['id']}", json={"notes": "ok"}, headers=admin).status_code == 200
    assert client.post(f"/api/invoices/{inv['id']}/cancel", json={"reason": "erreur"}, headers=admin).status_code == 400


def test_invoice_cancel(client, admin):
    c = make_client(client, admin)
    inv = make_invoice(client, admin, c["id"])
    r = client.post(f"/api/invoices/{inv['id']}/cancel", json={"reason": "Doublon"}, headers=admin)
    assert r.json()["status"] == "cancelled"
    r = client.post("/api/payments", json={"invoice_id": inv["id"], "amount": "1", "method": "cash"}, headers=admin)
    assert r.json()["detail"] == "invoice_cancelled"


def test_overdue_invoices(client, admin):
    c = make_client(client, admin)
    past = date.today() - timedelta(days=60)
    inv = _invoice_2500(client, admin, c["id"], issue_date=str(past), due_date=str(past + timedelta(days=30)))
    assert inv["status"] == "overdue"
    client.post("/api/payments", json={"invoice_id": inv["id"], "amount": "500", "method": "cash"}, headers=admin)
    assert client.get(f"/api/invoices/{inv['id']}", headers=admin).json()["status"] == "overdue"
    # status refresh job on stored invoices
    inv2 = _invoice_2500(client, admin, c["id"])
    with SessionLocal() as db:
        db.execute(update(Invoice).where(Invoice.number == inv2["number"]).values(
            issue_date=past, due_date=past + timedelta(days=1)))
        db.commit()
    lst = client.get("/api/invoices?status=overdue", headers=admin).json()
    assert lst["total"] == 2
    rep = client.get("/api/reports", headers=admin).json()
    assert money(rep["summary"]["overdue"]) == D("4500.000")


# ---------------- PDFs ----------------
def test_pdf_generation_fr_ar(client, admin):
    c = make_client(client, admin, "شركة النور")
    q = make_quote(client, admin, c["id"], special_conditions="شروط خاصة للتجربة")
    for lang in ("fr", "ar"):
        r = client.get(f"/api/quotes/{q['id']}/pdf?lang={lang}&download=true", headers=admin)
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"
        assert r.content.startswith(b"%PDF") and len(r.content) > 5000
        assert "attachment" in r.headers["content-disposition"]
    inv = make_invoice(client, admin, c["id"])
    client.post("/api/payments", json={"invoice_id": inv["id"], "amount": "100", "method": "cash"}, headers=admin)
    r = client.get(f"/api/invoices/{inv['id']}/pdf?lang=ar", headers=admin)
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    docs = client.get(f"/api/clients/{c['id']}", headers=admin).json()["documents"]
    assert {d["kind"] for d in docs} == {"quote_pdf", "invoice_pdf"}
    d = client.get(f"/api/documents/{docs[0]['id']}", headers=admin)
    assert d.status_code == 200 and d.content.startswith(b"%PDF")


# ---------------- Dashboard / reports ----------------
def test_dashboard_and_reports(client, admin):
    c = make_client(client, admin)
    q = make_quote(client, admin, c["id"])
    client.post(f"/api/quotes/{q['id']}/status", json={"status": "sent"}, headers=admin)
    inv = _invoice_2500(client, admin, c["id"])
    client.post("/api/payments", json={"invoice_id": inv["id"], "amount": "1000", "method": "cash"}, headers=admin)
    d = client.get("/api/dashboard?period=month", headers=admin).json()
    s = d["stats"]
    assert s["clients"] == 1 and s["quotes"] == 1 and s["quotes_pending"] == 1
    assert s["invoices"] == 1 and s["invoices_partial"] == 1
    assert money(s["total_invoiced"]) == D("2500.000")
    assert money(s["total_collected"]) == D("1000.000")
    assert money(s["total_outstanding"]) == D("1500.000")
    assert len(d["monthly"]) == 12
    rep = client.get("/api/reports?period=year", headers=admin).json()
    assert rep["by_client"][0]["name"] == "Client Test"
    for fmt, ctype in (("pdf", "application/pdf"), ("xlsx", "spreadsheetml")):
        r = client.get(f"/api/reports/export?format={fmt}", headers=admin)
        assert r.status_code == 200 and ctype in r.headers["content-type"]
    assert client.get("/api/stats/balance", headers=admin).json()["inconsistent"] == []


def test_settings_numbering_prefix(client, admin):
    r = client.patch("/api/settings", json={"quote_prefix": "DV", "tax_rates": [0, 7, 19], "default_tax_rate": 19},
                     headers=admin)
    assert r.status_code == 200
    c = make_client(client, admin)
    assert make_quote(client, admin, c["id"])["number"] == f"DV-{Y}-001"
    assert client.patch("/api/settings", json={"default_tax_rate": 13}, headers=admin).status_code == 400


def test_public_forms_and_notifications(client, manager):
    r = client.post("/api/public/quote-request", json={"name": "Visiteur", "phone": "+21620000000", "service": "climatisation",
                                                       "message": "Installation de 3 splits"})
    assert r.status_code == 201
    # honeypot
    r = client.post("/api/public/contact", json={"name": "Bot", "phone": "+21620000000", "message": "spam spam",
                                                 "website": "http://spam"})
    assert r.status_code == 400
    reqs = client.get("/api/requests", headers=manager).json()
    assert reqs["total"] == 1
    notes = client.get("/api/notifications", headers=manager).json()
    assert notes["unread"] >= 1 and notes["items"][0]["type"] == "request.created"
    first = notes["items"][0]["id"]
    assert client.post("/api/notifications/read", json=[first], headers=manager).status_code == 204
    client.post("/api/notifications/read", headers=manager)
    assert client.get("/api/notifications", headers=manager).json()["unread"] == 0


def test_global_search(client, manager):
    c = make_client(client, manager, "Hôtel Méditerranée")
    make_quote(client, manager, c["id"])
    r = client.get("/api/search?q=médit", headers=manager).json()
    assert r["clients"][0]["label"] == "Hôtel Méditerranée" and len(r["quotes"]) == 1


def test_quote_delete_rules(client, manager, admin):
    cid = make_client(client, manager)["id"]
    q = make_quote(client, manager, cid)
    assert client.delete(f"/api/quotes/{q['id']}", headers=manager).status_code == 204
    assert client.get(f"/api/quotes/{q['id']}", headers=manager).status_code == 404
    # a quote converted to an invoice cannot be deleted
    q2 = make_quote(client, manager, cid)
    client.post(f"/api/quotes/{q2['id']}/status", json={"status": "sent"}, headers=manager)
    client.post(f"/api/quotes/{q2['id']}/decision", json={"decision": "accepted"}, headers=manager)
    r = client.post(f"/api/invoices/from-quote/{q2['id']}", json={}, headers=admin)
    if r.status_code == 201:
        assert client.delete(f"/api/quotes/{q2['id']}", headers=manager).json()["detail"] == "quote_has_invoice"
