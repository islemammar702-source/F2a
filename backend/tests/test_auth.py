from tests.conftest import PASSWORDS, login


def test_login_logout_and_me(client):
    r = client.post("/api/auth/login", json={"email": "admin@test.tn", "password": PASSWORDS["admin"]})
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["role"]["code"] == "admin"
    assert "users.manage" in body["user"]["permissions"]
    assert "f2a_refresh" in r.cookies
    h = {"Authorization": f"Bearer {body['access_token']}"}
    assert client.get("/api/auth/me", headers=h).status_code == 200
    assert client.post("/api/auth/logout").status_code == 204
    # access token bound to the revoked session is rejected immediately
    assert client.get("/api/auth/me", headers=h).status_code == 401


def test_wrong_password_and_rate_limit(client):
    for _ in range(5):
        r = client.post("/api/auth/login", json={"email": "admin@test.tn", "password": "wrong-pass1"})
        assert r.status_code == 401
        assert r.json()["detail"] == "invalid_credentials"
    r = client.post("/api/auth/login", json={"email": "admin@test.tn", "password": PASSWORDS["admin"]})
    assert r.status_code == 429


def test_unknown_email_same_error(client):
    r = client.post("/api/auth/login", json={"email": "nobody@test.tn", "password": "whatever1"})
    assert r.status_code == 401 and r.json()["detail"] == "invalid_credentials"


def test_refresh_rotation_and_reuse_detection(client):
    login(client, "admin@test.tn", PASSWORDS["admin"], remember=True)
    old = client.cookies.get("f2a_refresh")
    r = client.post("/api/auth/refresh")
    assert r.status_code == 200
    new = client.cookies.get("f2a_refresh")
    assert new and new != old
    # replay of the old token → whole family revoked
    client.cookies.set("f2a_refresh", old, path="/api/auth")
    assert client.post("/api/auth/refresh").json()["detail"] == "refresh_token_reused"
    client.cookies.set("f2a_refresh", new, path="/api/auth")
    assert client.post("/api/auth/refresh").status_code == 401


def test_protected_routes_require_token(client):
    for path in ("/api/clients", "/api/quotes", "/api/invoices", "/api/payments", "/api/dashboard", "/api/users"):
        assert client.get(path).status_code == 401


def test_forgot_and_reset_password(client):
    r = client.post("/api/auth/forgot-password", json={"email": "manager@test.tn"})
    assert r.status_code == 200
    # unknown email → same answer (no enumeration)
    assert client.post("/api/auth/forgot-password", json={"email": "x@test.tn"}).json()["detail"] == "reset_email_sent"
    link = r.json().get("dev_reset_link")
    assert link, "dev link expected outside production"
    token = link.split("token=")[1]
    assert client.post("/api/auth/reset-password", json={"token": token, "new_password": "short"}).status_code == 422
    assert client.post("/api/auth/reset-password", json={"token": token, "new_password": "NewPass2026"}).status_code == 204
    assert client.post("/api/auth/reset-password", json={"token": token, "new_password": "NewPass2026"}).status_code == 400
    login(client, "manager@test.tn", "NewPass2026")


def test_change_password(client, manager):
    r = client.post("/api/auth/change-password", headers=manager,
                    json={"current_password": "bad", "new_password": "Another2026"})
    assert r.status_code == 400
    r = client.post("/api/auth/change-password", headers=manager,
                    json={"current_password": PASSWORDS["manager"], "new_password": "Another2026"})
    assert r.status_code == 204
    login(client, "manager@test.tn", "Another2026")
