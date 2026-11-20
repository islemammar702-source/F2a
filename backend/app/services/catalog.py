"""Material / price catalogue: Excel import (upsert by reference) and export in the same format."""
import io
import re
import unicodedata
from decimal import Decimal, InvalidOperation

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import CatalogItem

UNITS = {"u": "u", "un": "u", "unite": "u", "pce": "u", "pc": "u", "pcs": "u", "piece": "u", "nb": "u",
         "ml": "ml", "m": "ml", "metre": "ml", "mts": "ml", "m2": "m2", "m²": "m2", "m3": "m3", "m³": "m3",
         "kg": "kg", "h": "h", "heure": "h", "j": "j", "jour": "j", "jours": "j",
         "forfait": "forfait", "ff": "forfait", "fft": "forfait", "lot": "lot", "ens": "lot", "ens.": "lot", "ensemble": "lot"}
UNIT_LABELS = {"u": "u", "ml": "ml", "m2": "m²", "m3": "m³", "kg": "kg", "h": "h", "j": "jour", "forfait": "forfait", "lot": "ens."}
TYPES = {"materiel": "material", "material": "material", "fourniture": "material",
         "main-d'oeuvre": "labor", "main d'oeuvre": "labor", "main-d'œuvre": "labor", "labor": "labor", "mo": "labor",
         "prestation": "service", "service": "service"}
HEADERS = ["Référence", "Désignation", "Unité", "Prix HT (TND)", "Catégorie", "TVA %", "Type"]

# column title (normalised) → field
COLUMNS = {
    "reference": "reference", "ref": "reference", "code": "reference", "article": "reference",
    "designation": "designation", "libelle": "designation", "produit": "designation", "nom": "designation", "description": "designation",
    "unite": "unit", "u": "unit",
    "prix": "price", "prix ht": "price", "prix unitaire": "price", "prix unitaire ht": "price", "pu": "price", "pu ht": "price",
    "categorie": "category", "famille": "category",
    "tva": "tva", "tva %": "tva", "taux tva": "tva",
    "type": "type",
}


def _norm(s) -> str:
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\(.*?\)", " ", s)  # "Prix HT (TND)" → "prix ht"
    return re.sub(r"\s+", " ", s.replace(".", " ").replace("_", " ")).strip()


def _money(v) -> Decimal | None:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float, Decimal)):
        d = Decimal(str(v))
    else:
        t = re.sub(r"[^\d,.\-]", "", str(v))
        if "," in t and "." in t:
            t = t.replace(".", "").replace(",", ".") if t.rfind(",") > t.rfind(".") else t.replace(",", "")
        else:
            t = t.replace(",", ".")
        try:
            d = Decimal(t)
        except InvalidOperation:
            return None
    return d.quantize(Decimal("0.001")) if d.is_finite() else None


def _type_for(category: str | None, unit: str, given: str | None) -> str:
    if given and _norm(given) in {_norm(k) for k in TYPES}:
        return next(v for k, v in TYPES.items() if _norm(k) == _norm(given))
    c = _norm(category)
    if "main" in c and "oeuvre" in c or "main-d" in c:
        return "labor"
    if unit == "forfait" or c in ("divers", "prestation", "prestations", "services"):
        return "service"
    return "material"


def import_xlsx(db: Session, data: bytes) -> dict:
    try:
        wb = load_workbook(io.BytesIO(data), data_only=True, read_only=True)
    except Exception:
        return {"error": "invalid_excel"}
    ws = wb["Catalogue"] if "Catalogue" in wb.sheetnames else wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    # find the header row (first row containing a "Désignation"-like and a "Prix"-like column)
    header_idx, cols = None, {}
    for i, row in enumerate(rows[:15]):
        found = {}
        for j, cell in enumerate(row):
            key = COLUMNS.get(_norm(cell))
            if key is None and _norm(cell).startswith("prix"):
                key = "price"
            if key and key not in found:
                found[key] = j
        if "designation" in found and "price" in found:
            header_idx, cols = i, found
            break
    if header_idx is None:
        return {"error": "catalog_columns_missing"}

    existing = {c.reference.lower(): c for c in db.execute(select(CatalogItem)).scalars()}
    by_name = {c.designation.lower(): c for c in existing.values()}
    created = updated = 0
    errors: list[dict] = []
    seen: set[str] = set()
    for n, row in enumerate(rows[header_idx + 1:], start=header_idx + 2):
        get = lambda k: row[cols[k]] if k in cols and cols[k] < len(row) else None  # noqa: E731
        des = str(get("designation") or "").strip()
        if not des:
            continue
        price = _money(get("price"))
        if price is None or price < 0:
            errors.append({"row": n, "designation": des[:80], "error": "price"})
            continue
        ref = str(get("reference") or "").strip()[:64]
        raw_unit = str(get("unit") or "").strip().lower()
        unit = UNITS.get(raw_unit) or UNITS.get(raw_unit.rstrip(".")) or UNITS.get(_norm(raw_unit).replace(" ", "")) or "u"
        category = (str(get("category")).strip()[:100] or None) if get("category") else None
        tva = _money(get("tva"))
        if tva is not None and tva <= 1:  # 0.19 written as a percentage format in Excel
            tva = (tva * 100).quantize(Decimal("0.01"))
        if tva is not None and not (0 <= tva <= 100):
            tva = None
        item = existing.get(ref.lower()) if ref else by_name.get(des.lower())
        key = (ref or des).lower()
        if key in seen:
            errors.append({"row": n, "designation": des[:80], "error": "duplicate"})
            continue
        seen.add(key)
        if item is None:
            item = CatalogItem(reference=ref or f"ART-{len(existing) + created + 1:04d}")
            db.add(item)
            existing[item.reference.lower()] = item
            created += 1
        else:
            updated += 1
        item.designation = des[:255]
        item.unit = unit
        item.unit_price_ht = price
        item.category = category
        item.tva_rate = tva
        item.item_type = _type_for(category, unit, get("type"))
        item.is_active = True
    db.flush()
    return {"created": created, "updated": updated, "errors": errors}


def export_xlsx(db: Session) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Catalogue"
    ws.append(HEADERS)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="0E2440")
    items = db.execute(select(CatalogItem).where(CatalogItem.is_active.is_(True))
                       .order_by(func.coalesce(CatalogItem.category, ""), CatalogItem.designation)).scalars()
    type_fr = {"material": "Matériel", "labor": "Main-d'œuvre", "service": "Prestation"}
    for it in items:
        ws.append([it.reference, it.designation, UNIT_LABELS.get(it.unit, it.unit), float(it.unit_price_ht), it.category,
                   float(it.tva_rate) if it.tva_rate is not None else None, type_fr.get(it.item_type)])
    for col, w in zip("ABCDEFG", (14, 48, 10, 15, 24, 8, 14)):
        ws.column_dimensions[col].width = w
    for row in ws.iter_rows(min_row=2, min_col=4, max_col=4):
        row[0].number_format = "#,##0.000"
    dv = DataValidation(type="list", formula1='"u,ml,m²,m³,kg,h,jour,forfait,ens."', allow_blank=True)
    ws.add_data_validation(dv)
    dv.add("C2:C2000")
    ws.freeze_panes = "A2"
    help_ws = wb.create_sheet("Mode d'emploi")
    for line in [
        "Catalogue matériel – F2A Travaux", "",
        "1. Une ligne = un matériel ou une prestation. Ne changez pas les noms des colonnes de la feuille « Catalogue ».",
        "2. Référence : code court unique (ex. CLIM-12). Une ligne avec une référence existante met à jour le prix.",
        "3. Unité : u, ml, m², m³, kg, h, jour, forfait, ens.  —  Prix HT en dinars (3 décimales).",
        "4. TVA % et Type (Matériel / Main-d'œuvre / Prestation) sont facultatifs.",
        "5. Dans le site : Catalogue → « Importer Excel » et choisissez ce fichier.",
    ]:
        help_ws.append([line])
    help_ws.column_dimensions["A"].width = 110
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()
