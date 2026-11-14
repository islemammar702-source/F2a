"""Role based access control and client data isolation."""
from tests.conftest import LINES, PASSWORDS, login, make_client, make_invoice, make_quote


def _roles(client, admin):
    return {r["code"]: r for r in client.get("/api/roles", headers=admin).json()}


def test_manager_permissions(client, manager):
    assert client.get("/api/clients", headers=manager).status_code == 200
    assert client.get("/api/users", headers=manager).status_code == 403
    assert client.get("/api/reports", headers=manager).status_code == 403
    assert client.patch("/api/settings", json={"name": "X Co"}, headers=manager).status_code == 403
    assert client.post("/api/payments", json={"invoice_id": "00000000-0000-0000-0000-000000000000", "amount": "1",
                                              "method": "cash"}, headers=manager).status_code == 403


def test_accountant_permissions(client, accountant, admin):
    c = make_client(client, admin)
    assert client.post("/api/clients", json={"name": "Nope"}, headers=accountant).status_code == 403
    assert client.post("/api/quotes", json={"client_id": c["id"], "title": "Titre", "items": LINES},
                       headers=accountant).status_code == 403
    assert client.get("/api/invoices", headers=accountant).status_code == 200
    assert client.get("/api/reports", headers=accountant).status_code == 200
    assert client.get("/api/quotes", headers=accountant).status_code == 403


def test_admin_can_manage_users_and_roles(client, admin):
    roles = _roles(client, admin)
    r = client.post("/api/users", headers=admin, json={"email": "new@test.tn", "full_name": "New User",
                                                       "password": "Passw0rd!", "role_id": roles["manager"]["id"]})
    assert r.status_code == 201
    uid = r.json()["id"]
    assert client.post("/api/users", headers=admin, json={"email": "new@test.tn", "full_name": "Dup",
                                                          "password": "Passw0rd!", "role_id": roles["manager"]["id"]}).status_code == 409
    # deactivate → cannot log in
    assert client.patch(f"/api/users/{uid}", headers=admin, json={"is_active": False}).status_code == 200
    assert client.post("/api/auth/login", json={"email": "new@test.tn", "password": "Passw0rd!"}).status_code == 403
    assert client.delete(f"/api/users/{uid}", headers=admin).status_code == 204

    # configurable permissions: give accountant "quotes.view"
    acc = roles["accountant"]
    perms = [p["code"] for p in acc["permissions"]] + ["quotes.view"]
    assert client.patch(f"/api/roles/{acc['id']}", headers=admin, json={"permissions": perms}).status_code == 200
    h = login(client, "accountant@test.tn", PASSWORDS["accountant"])
    assert client.get("/api/quotes", headers=h).status_code == 200
    # custom role CRUD
    r = client.post("/api/roles", headers=admin, json={"code": "technicien", "name_fr": "Technicien", "name_ar": "تقني",
                                                       "permissions": ["clients.view"]})
    assert r.status_code == 201
    assert client.delete(f"/api/roles/{r.json()['id']}", headers=admin).status_code == 204
    assert client.delete(f"/api/roles/{roles['admin']['id']}", headers=admin).status_code == 400


def test_cannot_remove_last_admin(client, admin):
    me = client.get("/api/auth/me", headers=admin).json()
    assert client.delete(f"/api/users/{me['id']}", headers=admin).status_code == 400
    assert client.patch(f"/api/users/{me['id']}", headers=admin, json={"is_active": False}).status_code == 400


def _client_user(client, admin, client_id, email):
    roles = _roles(client, admin)
    r = client.post("/api/users", headers=admin, json={"email": email, "full_name": "Portal", "password": "Portal2026",
                                                       "role_id": roles["client"]["id"], "client_id": client_id})
    assert r.status_code == 201, r.text
    return login(client, email, "Portal2026")


def test_client_portal_isolation(client, admin):
    a = make_client(client, admin, "Client A")
    b = make_client(client, admin, "Client B")
    qa = make_quote(client, admin, a["id"])
    qb = make_quote(client, admin, b["id"])
    client.post(f"/api/quotes/{qa['id']}/status", json={"status": "sent"}, headers=admin)
    client.post(f"/api/quotes/{qb['id']}/status", json={"status": "sent"}, headers=admin)
    ib = make_invoice(client, admin, b["id"])
    ha = _client_user(client, admin, a["id"], "a@portal.tn")

    # staff API is forbidden for client accounts
    assert client.get("/api/clients", headers=ha).status_code == 403
    assert client.get(f"/api/invoices/{ib['id']}", headers=ha).status_code == 403
    # portal only shows own data
    quotes = client.get("/api/portal/quotes", headers=ha).json()
    assert [q["id"] for q in quotes] == [qa["id"]]
    assert client.get(f"/api/portal/quotes/{qb['id']}", headers=ha).status_code == 404
    assert client.get(f"/api/portal/invoices/{ib['id']}", headers=ha).status_code == 404
    assert client.get(f"/api/portal/invoices/{ib['id']}/pdf", headers=ha).status_code == 404
    assert client.get("/api/portal/invoices", headers=ha).json() == []
    # client accepts its quote
    r = client.post(f"/api/portal/quotes/{qa['id']}/decision", json={"decision": "accepted"}, headers=ha)
    assert r.status_code == 200 and r.json()["status"] == "accepted"
    # documents of another client are not downloadable
    client.get(f"/api/invoices/{ib['id']}/pdf", headers=admin)
    docs = client.get(f"/api/clients/{b['id']}", headers=admin).json()["documents"]
    assert docs
    assert client.get(f"/api/documents/{docs[0]['id']}", headers=ha).status_code == 404


def test_staff_cannot_use_portal(client, admin):
    assert client.get("/api/portal/quotes", headers=admin).status_code == 403
