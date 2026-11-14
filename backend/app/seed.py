"""Seed reference data: permissions, default roles, company settings and the first administrator.

Usage:
    python -m app.seed                       # roles + settings + admin (from env ADMIN_EMAIL / ADMIN_PASSWORD)
    python -m app.seed --demo                # + demo staff/client accounts and sample data
"""
import argparse
import os
import sys
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.permissions import DEFAULT_ROLES, PERMISSIONS
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import Client, Permission, Role, User
from app.services.settings_service import get_company_settings


def seed_reference(db: Session) -> None:
    existing = {p.code: p for p in db.execute(select(Permission)).scalars()}
    for code, (module, desc) in PERMISSIONS.items():
        if code not in existing:
            existing[code] = Permission(code=code, module=module, description=desc)
            db.add(existing[code])
    db.flush()
    for code, spec in DEFAULT_ROLES.items():
        role = db.execute(select(Role).where(Role.code == code)).scalar_one_or_none()
        if role is None:
            role = Role(code=code, name_fr=spec["name_fr"], name_ar=spec["name_ar"], is_system=True,
                        is_client_role=spec["is_client_role"])
            role.permissions = [existing[c] for c in spec["permissions"]]
            db.add(role)
        elif code == "admin":
            role.permissions = list(existing.values())  # admin always has everything
    cs = get_company_settings(db)
    if not cs.address:
        cs.address = "Zone industrielle"
        cs.city = "Tunis"
        cs.phone = "+216 22 907 339"
        cs.whatsapp = "+21622907339"
        cs.email = "contact@f2a-travaux.tn"
        cs.payment_terms_fr = "50 % à la commande, solde à la fin des travaux. Paiement par virement, chèque ou espèces."
        cs.payment_terms_ar = "50 % عند الطلب والباقي عند انتهاء الأشغال. الدفع بالتحويل أو الصك أو نقدًا."
        cs.terms_fr = "Les travaux non prévus au présent document feront l'objet d'un devis complémentaire. Matériel garanti selon les conditions du fabricant."
        cs.terms_ar = "الأشغال غير المذكورة في هذه الوثيقة تكون موضوع عرض سعر تكميلي. المعدات مضمونة حسب شروط المصنع."
        cs.footer_fr = "F2A TRAVAUX – Chauffage central • Ventilation • Climatisation • Plomberie • Sanitaire"
        cs.footer_ar = "F2A للأشغال – تدفئة مركزية • تهوئة • تكييف • سباكة • تجهيزات صحية"
    db.flush()


def ensure_user(db: Session, email: str, password: str, name: str, role_code: str, client_id=None) -> User:
    user = db.execute(select(User).where(User.email == email, User.deleted_at.is_(None))).scalar_one_or_none()
    if user:
        return user
    role = db.execute(select(Role).where(Role.code == role_code)).scalar_one()
    user = User(email=email, full_name=name, password_hash=hash_password(password), role_id=role.id, client_id=client_id)
    db.add(user)
    db.flush()
    return user


def seed_demo(db: Session) -> None:
    from app.schemas.sales import LineIn
    from app.services.numbering import next_number
    from app.services.sales import recompute_invoice, set_invoice_items, set_quote_items
    from app.models import Invoice, Payment, Quote

    if db.execute(select(Client).limit(1)).first():
        print("Demo data already present – skipped")
        return
    ensure_user(db, "gestionnaire@f2a.tn", "Gestion2026!", "Sami Gestionnaire", "manager")
    ensure_user(db, "comptable@f2a.tn", "Compta2026!", "Leila Comptable", "accountant")
    c1 = Client(client_type="company", name="Résidence Les Jasmins", contact_name="M. Karim Ben Ali", phone="+216 22 111 222",
                whatsapp="+21622111222", email="syndic@jasmins.tn", address="Avenue Habib Bourguiba", city="La Marsa",
                tax_id="1234567/A/M/000")
    c2 = Client(client_type="individual", name="Mme Amira Trabelsi", phone="+216 98 333 444", whatsapp="+21698333444",
                email="amira@example.tn", address="Rue de Carthage", city="Ariana")
    c3 = Client(client_type="public", name="Clinique El Amen", phone="+216 71 555 666", email="achats@elamen.tn",
                address="Les Berges du Lac", city="Tunis", tax_id="7654321/B/P/000")
    db.add_all([c1, c2, c3])
    db.flush()
    ensure_user(db, "client@f2a.tn", "Client2026!", "Amira Trabelsi", "client", client_id=c2.id)

    today = date.today()
    lines = [
        LineIn(item_type="material", designation="Chaudière murale gaz 24 kW", quantity=1, unit="u", unit_price_ht=Decimal("1850"), tva_rate=19),
        LineIn(item_type="material", designation="Radiateur acier 600x1000", quantity=6, unit="u", unit_price_ht=Decimal("185.5"), tva_rate=19),
        LineIn(item_type="material", designation="Tube multicouche Ø16", quantity=80, unit="ml", unit_price_ht=Decimal("4.8"), tva_rate=19),
        LineIn(item_type="labor", designation="Main-d'œuvre installation chauffage central", quantity=4, unit="j", unit_price_ht=Decimal("220"), discount=Decimal("80"), tva_rate=19),
    ]
    specs = [(c2, "Installation chauffage central – villa", "accepted", 40), (c1, "Climatisation hall d'entrée", "sent", 10),
             (c3, "Réseau fluides médicaux – bloc B", "draft", 2)]
    quotes = []
    for client, title, status, ago in specs:
        issue = today - timedelta(days=ago)
        q = Quote(number=next_number(db, "quote", issue), client_id=client.id, title=title, issue_date=issue,
                  validity_date=issue + timedelta(days=60), status=status, language="fr")
        db.add(q)
        set_quote_items(db, q, lines)
        quotes.append(q)
    db.flush()
    q = quotes[0]
    inv = Invoice(number=next_number(db, "invoice", today - timedelta(days=30)), client_id=q.client_id, quote_id=q.id,
                  title=q.title, issue_date=today - timedelta(days=30), due_date=today + timedelta(days=15), status="unpaid")
    db.add(inv)
    set_invoice_items(db, inv, lines)
    db.flush()
    recompute_invoice(db, inv, apply_stamp=True)
    for amt, ago, method in [(Decimal("1500"), 25, "transfer"), (Decimal("800"), 5, "check")]:
        db.add(Payment(number=next_number(db, "payment", today - timedelta(days=ago)), invoice_id=inv.id, client_id=inv.client_id,
                       amount=amt, payment_date=today - timedelta(days=ago), method=method, status="valid"))
    db.flush()
    recompute_invoice(db, inv)
    inv2 = Invoice(number=next_number(db, "invoice", today - timedelta(days=70)), client_id=c1.id, title="Entretien annuel VMC",
                   issue_date=today - timedelta(days=70), due_date=today - timedelta(days=40), status="unpaid")
    db.add(inv2)
    set_invoice_items(db, inv2, [LineIn(item_type="service", designation="Contrat d'entretien VMC – 12 logements", quantity=12,
                                        unit="u", unit_price_ht=Decimal("45"), tva_rate=19)])
    db.flush()
    recompute_invoice(db, inv2, apply_stamp=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--demo", action="store_true")
    args = parser.parse_args()
    email = os.environ.get("ADMIN_EMAIL", "admin@f2a.tn")
    password = os.environ.get("ADMIN_PASSWORD", "Admin2026!")
    with SessionLocal() as db:
        seed_reference(db)
        ensure_user(db, email, password, "Administrateur F2A", "admin")
        if args.demo:
            seed_demo(db)
        db.commit()
    print(f"Seed OK – administrator: {email}", file=sys.stderr)


if __name__ == "__main__":
    main()
