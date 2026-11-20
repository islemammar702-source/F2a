"""Scan / photo import: upload, attach to quote/invoice, permissions. AI reading is mocked."""
import io

from PIL import Image

from app.services import scan_ai, scan_ocr
from tests.conftest import make_client, make_invoice, make_quote


def _png() -> bytes:
    b = io.BytesIO()
    Image.new("RGB", (40, 30), "white").save(b, "PNG")
    return b.getvalue()


def _upload(client, headers, target, data=None, mime="image/png", name="scan.png"):
    return client.post(f"/api/scan/{target}", files={"file": (name, data or _png(), mime)}, headers=headers)


def test_scan_without_any_reader_only_stores_file(client, manager, monkeypatch):
    monkeypatch.setattr(scan_ai.settings, "ANTHROPIC_API_KEY", "")
    monkeypatch.setattr(scan_ocr, "available", lambda: False)
    r = _upload(client, manager, "quote")
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["ai_enabled"] is False and body["extracted"] is None
    assert body["document"]["kind"] == "quote_scan"


def test_scan_rejects_fake_file(client, manager):
    r = _upload(client, manager, "invoice", data=b"not an image", mime="image/png")
    assert r.status_code == 400


def test_scan_with_ai_returns_cleaned_data(client, manager, monkeypatch):
    monkeypatch.setattr(scan_ai.settings, "ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(scan_ai, "_call_claude", lambda data, mime, target: {
        "client": {"name": "Résidence Test"}, "title": "Climatisation", "issue_date": "2026-11-02",
        "items": [{"designation": "Split 12000 BTU", "quantity": 2, "unit": "u", "unit_price_ht": 1250.5, "tva_rate": 19}],
    })
    r = _upload(client, manager, "quote")
    assert r.status_code == 201, r.text
    ex = r.json()["extracted"]
    assert ex["client"]["name"] == "Résidence Test"
    assert ex["items"][0]["unit_price_ht"] == "1250.5"


def test_ai_error_still_keeps_file(client, manager, monkeypatch):
    monkeypatch.setattr(scan_ai.settings, "ANTHROPIC_API_KEY", "bad")

    def boom(*a):
        raise scan_ai.ScanError("scan_ai_bad_key")

    monkeypatch.setattr(scan_ai, "_call_claude", boom)
    r = _upload(client, manager, "invoice")
    assert r.status_code == 201
    assert r.json()["ai_error"] == "scan_ai_bad_key"


def test_attach_list_download_delete(client, manager):
    cid = make_client(client, manager)["id"]
    q = make_quote(client, manager, cid)
    doc = _upload(client, manager, "quote").json()["document"]
    r = client.post(f"/api/attachments/quote/{q['id']}", json={"document_ids": [doc["id"]]}, headers=manager)
    assert r.status_code == 200, r.text
    assert [d["id"] for d in r.json()] == [doc["id"]]
    # cannot attach the same scan twice
    r = client.post(f"/api/attachments/quote/{q['id']}", json={"document_ids": [doc["id"]]}, headers=manager)
    assert r.status_code == 400
    # direct upload on an existing quote
    r = client.post(f"/api/attachments/quote/{q['id']}/upload", files={"file": ("b.png", _png(), "image/png")}, headers=manager)
    assert r.status_code == 201 and len(r.json()) == 2
    assert client.get(f"/api/documents/{doc['id']}", headers=manager).status_code == 200
    assert client.delete(f"/api/attachments/file/{doc['id']}", headers=manager).status_code == 204
    assert len(client.get(f"/api/attachments/quote/{q['id']}", headers=manager).json()) == 1


def test_scan_permissions(client, accountant, admin):
    # accountant cannot create quotes → cannot scan quotes, but can scan payments
    assert _upload(client, accountant, "quote").status_code == 403
    assert _upload(client, accountant, "payment").json()["document"]["kind"] == "payment_proof"
    cid = make_client(client, admin)["id"]
    inv = make_invoice(client, admin, cid)
    doc = _upload(client, admin, "invoice").json()["document"]
    # a scan of the wrong kind cannot be attached to an invoice
    qdoc = _upload(client, admin, "quote").json()["document"]
    r = client.post(f"/api/attachments/invoice/{inv['id']}", json={"document_ids": [qdoc["id"]]}, headers=admin)
    assert r.status_code == 400
    r = client.post(f"/api/attachments/invoice/{inv['id']}", json={"document_ids": [doc["id"]]}, headers=admin)
    assert r.status_code == 200


# ---------- free OCR reader: parsing rules (no Tesseract needed) ----------
INVOICE_TEXT = """SOCIETE CLIMA PLUS
Tél: 71222333 MF : 1234567A/M/000
FACTURE N° FA-2025/118
Date : 12/09/2025
Client : Résidence Les Oliviers
Tél : 98 765 432
Objet : Installation climatisation bureaux
Désignation Qté U PUHT Total HT
Split mural 12000 BTU 2 u 1 250,500 2 501,000
Tuyauterie cuivre 15 ml 18,000 270,000
Main d'oeuvre pose 2 j 150,000 300,000
Ligne illisible 3 u 10,000 99,000
Total HT 3 071,000
TVA 19 % 583,490
Timbre fiscal 1,000
Net à payer 3 655,490
Date d'échéance : 12/10/2025
"""


def test_ocr_parse_invoice():
    r = scan_ocr.parse_sales(INVOICE_TEXT, "invoice")
    assert r["document_number"] == "FA-2025/118"
    assert r["client"] == {"name": "Résidence Les Oliviers", "phone": "98765432", "email": None, "tax_id": None}
    assert (r["issue_date"], r["second_date"]) == ("2025-09-12", "2025-10-12")
    assert r["title"] == "Installation climatisation bureaux" and r["apply_stamp_duty"] is True
    assert r["total_ttc"] == "3655.490"
    # inconsistent line (3 × 10 ≠ 99) is dropped
    assert [(i["designation"], i["quantity"], i["unit"], i["unit_price_ht"], i["item_type"]) for i in r["items"]] == [
        ("Split mural 12000 BTU", "2", "u", "1250.500", "material"),
        ("Tuyauterie cuivre", "15", "ml", "18.000", "material"),
        ("Main d'oeuvre pose", "2", "j", "150.000", "labor"),
    ]
    assert all(i["tva_rate"] == "19" for i in r["items"])


def test_ocr_parse_payment_and_money():
    r = scan_ocr.parse_payment("CHEQUE N° 4587123\nMontant : 1 500,000 DT\nTunis, le 03/11/2026\nRèglement facture FAC-2026-014")
    assert r == {"amount": "1500.000", "payment_date": "2026-11-03", "method": "cheque", "reference": "4587123",
                 "invoice_number": "FAC-2026-014"}
    assert [str(scan_ocr.parse_money(x)) for x in ["1 250,500", "1.250,500", "1,250.5", "18,000", "300"]] == \
        ["1250.500", "1250.500", "1250.5", "18.000", "300"]


def test_ocr_rows_with_currency_and_vat_columns():
    r = scan_ocr.parse_sales("Devis N° 143\nDate : 07/04/2025\nValidité : 15 jours\n"
                             "Main-d'oeuvre 5 h 60,00 € 20% 60,00€ 360,00 €\nProduit 10 pcs 105,00 € 20% 210,00€ 1 260,00 €\n"
                             "Total TTC 1 620,00 €", "quote")
    assert r["second_date"] == "2025-04-22"
    assert [(i["designation"], i["quantity"], i["unit"], i["unit_price_ht"], i["tva_rate"]) for i in r["items"]] == [
        ("Main-d'oeuvre", "5", "h", "60.00", "20"), ("Produit", "10", "u", "105.00", "20")]
