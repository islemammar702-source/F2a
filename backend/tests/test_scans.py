"""Scan / photo import: upload, attach to quote/invoice, permissions. AI reading is mocked."""
import io

from PIL import Image

from app.services import scan_ai
from tests.conftest import make_client, make_invoice, make_quote


def _png() -> bytes:
    b = io.BytesIO()
    Image.new("RGB", (40, 30), "white").save(b, "PNG")
    return b.getvalue()


def _upload(client, headers, target, data=None, mime="image/png", name="scan.png"):
    return client.post(f"/api/scan/{target}", files={"file": (name, data or _png(), mime)}, headers=headers)


def test_scan_without_ai_key_only_stores_file(client, manager, monkeypatch):
    monkeypatch.setattr(scan_ai.settings, "ANTHROPIC_API_KEY", "")
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
