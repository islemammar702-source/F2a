"""Material catalogue: Excel import / export, search used by the quote & invoice forms, permissions."""
import io

from openpyxl import Workbook, load_workbook


def _xlsx(rows) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Catalogue"
    ws.append(["Référence", "Désignation", "Unité", "Prix HT (TND)", "Catégorie"])
    for r in rows:
        ws.append(r)
    b = io.BytesIO()
    wb.save(b)
    return b.getvalue()


def _import(client, headers, rows):
    return client.post("/api/catalog/import", headers=headers,
                       files={"file": ("cat.xlsx", _xlsx(rows), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})


def test_import_search_update_export(client, manager):
    r = _import(client, manager, [
        ("CLIM-12", "Climatiseur split inverter 12 000 BTU", "u", 1450, "Climatisation"),
        ("CU-1438", "Tube cuivre isolé 1/4 - 3/8", "ml", 28, "Liaisons frigorifiques"),
        ("MO-H", "Main-d'œuvre technicien", "h", 25, "Main-d'œuvre"),
        ("DEPL", "Déplacement et nettoyage chantier", "forfait", 60, "Divers"),
        ("BAD", "Sans prix", "u", None, "X"),
    ])
    assert r.status_code == 200, r.text
    assert r.json()["created"] == 4 and r.json()["errors"][0]["error"] == "price"

    found = client.get("/api/catalog", params={"q": "split 12"}, headers=manager).json()
    assert [f["reference"] for f in found] == ["CLIM-12"]
    assert found[0]["unit_price_ht"] == "1450.000" and found[0]["item_type"] == "material"
    types = {f["reference"]: f["item_type"] for f in client.get("/api/catalog", headers=manager).json()}
    assert types["MO-H"] == "labor" and types["DEPL"] == "service"

    # re-import with a new price updates the same reference (no duplicate)
    r = _import(client, manager, [("CLIM-12", "Climatiseur split inverter 12 000 BTU", "u", 1500, "Climatisation")])
    assert r.json() == {"created": 0, "updated": 1, "errors": []}
    assert client.get("/api/catalog", params={"q": "CLIM-12"}, headers=manager).json()[0]["unit_price_ht"] == "1500.000"

    x = client.get("/api/catalog/export", headers=manager)
    ws = load_workbook(io.BytesIO(x.content))["Catalogue"]
    assert ws.max_row == 5


def test_crud_and_permissions(client, manager, accountant):
    body = {"reference": "VMC-SF", "designation": "VMC simple flux", "unit": "u", "unit_price_ht": "650", "item_type": "material"}
    item = client.post("/api/catalog", json=body, headers=manager).json()
    assert client.post("/api/catalog", json=body, headers=manager).json()["detail"] == "catalog_reference_exists"
    r = client.patch(f"/api/catalog/{item['id']}", json={**body, "unit_price_ht": "700"}, headers=manager)
    assert r.json()["unit_price_ht"] == "700.000"
    assert client.get("/api/catalog", headers=accountant).status_code == 403
    assert client.delete(f"/api/catalog/{item['id']}", headers=manager).status_code == 204


def test_import_rejects_non_excel(client, manager):
    r = client.post("/api/catalog/import", headers=manager, files={"file": ("x.xlsx", b"hello", "application/octet-stream")})
    assert r.json()["detail"] == "invalid_excel"
