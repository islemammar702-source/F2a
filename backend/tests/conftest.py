"""Test fixtures. Tests run against a dedicated PostgreSQL database (TEST_DATABASE_URL)."""
import os
import tempfile

os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://f2a:f2a_dev_password@localhost:5432/f2a_test")
os.environ["ENV"] = "test"
os.environ["STORAGE_DIR"] = tempfile.mkdtemp(prefix="f2a-test-storage-")
os.environ["SMTP_HOST"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db.session import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import ensure_user, seed_reference  # noqa: E402
from app.api.routes.auth import login_limiter, reset_limiter  # noqa: E402
from app.api.routes.public import form_limiter  # noqa: E402

PASSWORDS = {"admin": "Admin2026!", "manager": "Gestion2026!", "accountant": "Compta2026!", "client": "Client2026!"}


@pytest.fixture(scope="session", autouse=True)
def schema():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture(autouse=True)
def clean_db():
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    with SessionLocal() as db:
        seed_reference(db)
        ensure_user(db, "admin@test.tn", PASSWORDS["admin"], "Admin", "admin")
        ensure_user(db, "manager@test.tn", PASSWORDS["manager"], "Manager", "manager")
        ensure_user(db, "accountant@test.tn", PASSWORDS["accountant"], "Accountant", "accountant")
        db.commit()
    for lim in (login_limiter, reset_limiter, form_limiter):
        lim.clear()
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def login(client: TestClient, email: str, password: str, remember: bool = False) -> dict:
    r = client.post("/api/auth/login", json={"email": email, "password": password, "remember": remember})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def admin(client):
    return login(client, "admin@test.tn", PASSWORDS["admin"])


@pytest.fixture
def manager(client):
    return login(client, "manager@test.tn", PASSWORDS["manager"])


@pytest.fixture
def accountant(client):
    return login(client, "accountant@test.tn", PASSWORDS["accountant"])


def make_client(client, headers, name="Client Test", **kw) -> dict:
    r = client.post("/api/clients", json={"name": name, "phone": "+216 20 000 000", "email": "c@test.tn", **kw},
                    headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


LINES = [
    {"item_type": "material", "designation": "Chaudière", "quantity": "1", "unit": "u", "unit_price_ht": "1850.000",
     "discount": "0", "tva_rate": "19"},
    {"item_type": "labor", "designation": "Main-d'œuvre", "quantity": "4", "unit": "j", "unit_price_ht": "220",
     "discount": "80", "tva_rate": "19"},
    {"item_type": "service", "designation": "Mise en service", "quantity": "1", "unit": "forfait", "unit_price_ht": "100",
     "discount": "0", "tva_rate": "7"},
]


def make_quote(client, headers, client_id, lines=None, **kw) -> dict:
    r = client.post("/api/quotes", json={"client_id": client_id, "title": "Chauffage central", "items": lines or LINES, **kw},
                    headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def make_invoice(client, headers, client_id, lines=None, **kw) -> dict:
    body = {"client_id": client_id, "title": "Travaux", "items": lines or LINES, **kw}
    r = client.post("/api/invoices", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()
