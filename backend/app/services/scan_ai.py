"""Read a scanned / photographed quote, invoice or payment receipt with Claude (Anthropic API)
and return structured data used to pre-fill the forms.

The result is only a SUGGESTION: the user reviews it in the form, and the server recomputes and
validates everything on save exactly as for manual entry. Nothing is saved from here.
Disabled (returns None) when ANTHROPIC_API_KEY is not configured.
"""
import base64
import io
import logging
import re
from datetime import date
from decimal import Decimal, InvalidOperation

import httpx

from app.core.config import settings

log = logging.getLogger("f2a.scan")

API_URL = "https://api.anthropic.com/v1/messages"
UNITS = ["u", "ml", "m2", "m3", "kg", "h", "j", "forfait", "lot"]
ITEM_TYPES = ["service", "material", "labor"]


class ScanError(Exception):
    """Raised with a short code shown to the user (errors.<code>)."""


def ai_enabled() -> bool:
    return bool(settings.ANTHROPIC_API_KEY)


# ---------- JSON schemas given to the model (tool input) ----------
_CLIENT = {
    "type": "object",
    "description": "Le CLIENT (destinataire du devis/facture), pas l'émetteur F2A TRAVAUX.",
    "properties": {
        "name": {"type": "string"}, "phone": {"type": "string"}, "email": {"type": "string"},
        "address": {"type": "string"}, "city": {"type": "string"}, "tax_id": {"type": "string", "description": "Matricule fiscal"},
    },
}
_ITEM = {
    "type": "object",
    "properties": {
        "item_type": {"type": "string", "enum": ITEM_TYPES, "description": "material = fourniture/matériel, labor = main d'oeuvre, service = prestation/forfait"},
        "designation": {"type": "string"},
        "description": {"type": "string"},
        "quantity": {"type": "number"},
        "unit": {"type": "string", "enum": UNITS, "description": "u=unité, ml=mètre linéaire, m2, m3, kg, h=heure, j=jour, forfait, lot"},
        "unit_price_ht": {"type": "number", "description": "Prix unitaire HORS TAXE"},
        "discount": {"type": "number", "description": "Remise en montant (pas en %) sur la ligne, 0 si aucune"},
        "tva_rate": {"type": "number", "description": "Taux de TVA en %, ex. 19"},
    },
    "required": ["designation", "quantity", "unit_price_ht"],
}
SALES_SCHEMA = {
    "type": "object",
    "properties": {
        "document_number": {"type": "string", "description": "Numéro du document scanné"},
        "client": _CLIENT,
        "title": {"type": "string", "description": "Objet / intitulé des travaux (court)"},
        "site_address": {"type": "string", "description": "Adresse du chantier si indiquée"},
        "issue_date": {"type": "string", "description": "Date du document, format AAAA-MM-JJ"},
        "second_date": {"type": "string", "description": "Date de validité (devis) ou d'échéance (facture), AAAA-MM-JJ"},
        "payment_terms": {"type": "string"},
        "notes": {"type": "string"},
        "apply_stamp_duty": {"type": "boolean", "description": "true si un timbre fiscal apparaît"},
        "items": {"type": "array", "items": _ITEM},
        "total_ht": {"type": "number"},
        "total_ttc": {"type": "number"},
    },
    "required": ["items"],
}
PAYMENT_SCHEMA = {
    "type": "object",
    "properties": {
        "amount": {"type": "number", "description": "Montant payé en dinars"},
        "payment_date": {"type": "string", "description": "AAAA-MM-JJ"},
        "method": {"type": "string", "enum": ["cash", "cheque", "transfer", "card", "traite", "other"],
                   "description": "cash=espèces, cheque=chèque, transfer=virement, card=carte, traite=traite/effet"},
        "reference": {"type": "string", "description": "N° de chèque, de virement ou de reçu"},
        "invoice_number": {"type": "string", "description": "N° de facture concernée si mentionné (ex. FAC-2026-001)"},
        "payer_name": {"type": "string"},
        "comment": {"type": "string"},
    },
    "required": ["amount"],
}

PROMPTS = {
    "quote": "Ce document est un DEVIS d'une entreprise tunisienne de CVC / plomberie / fluides (montants en dinars, 3 décimales).",
    "invoice": "Ce document est une FACTURE d'une entreprise tunisienne de CVC / plomberie / fluides (montants en dinars, 3 décimales).",
    "payment": "Ce document est une preuve de PAIEMENT (chèque, reçu, avis de virement, bordereau…) en dinars tunisiens.",
}


def _shrink_image(data: bytes, mime: str) -> tuple[bytes, str]:
    """Phone photos are often > 5 MB (API image limit): resize to max 2000 px, re-encode as JPEG.
    The ORIGINAL file is still the one kept as attachment."""
    if mime == "application/pdf":
        return data, mime
    try:
        from PIL import Image, ImageOps

        im = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
        im = im.convert("RGB")
        im.thumbnail((2000, 2000))
        out = io.BytesIO()
        im.save(out, "JPEG", quality=85)
        return out.getvalue(), "image/jpeg"
    except Exception as e:  # unreadable image: let the API try the original
        log.info("Image shrink skipped: %s", e)
        return data, mime


def _call_claude(data: bytes, mime: str, target: str) -> dict:
    data, mime = _shrink_image(data, mime)
    schema = PAYMENT_SCHEMA if target == "payment" else SALES_SCHEMA
    b64 = base64.standard_b64encode(data).decode()
    source = {"type": "base64", "media_type": mime, "data": b64}
    block = {"type": "document", "source": source} if mime == "application/pdf" else {"type": "image", "source": source}
    instructions = (
        f"{PROMPTS[target]} Lis-le attentivement (il peut être photographié de travers ou manuscrit) et appelle l'outil "
        "`enregistrer` avec les données. Règles : recopie le texte tel qu'écrit (français ou arabe) ; nombres sans "
        "séparateur de milliers, point décimal ; dates au format AAAA-MM-JJ ; prix unitaires HORS TAXE ; "
        "n'invente rien : omets un champ illisible ou absent."
    )
    body = {
        "model": settings.ANTHROPIC_MODEL,
        "max_tokens": 4096,
        "tools": [{"name": "enregistrer", "description": "Enregistre les données lues sur le document.", "input_schema": schema}],
        "tool_choice": {"type": "tool", "name": "enregistrer"},
        "messages": [{"role": "user", "content": [block, {"type": "text", "text": instructions}]}],
    }
    headers = {"x-api-key": settings.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"}
    try:
        r = httpx.post(API_URL, json=body, headers=headers, timeout=settings.SCAN_AI_TIMEOUT)
    except httpx.HTTPError as e:
        log.warning("Scan AI unreachable: %s", e)
        raise ScanError("scan_ai_unreachable") from e
    if r.status_code in (401, 403):
        raise ScanError("scan_ai_bad_key")
    if r.status_code == 429 or r.status_code >= 500:
        raise ScanError("scan_ai_busy")
    if r.status_code != 200:
        log.warning("Scan AI error %s: %s", r.status_code, r.text[:500])
        raise ScanError("scan_ai_failed")
    for c in r.json().get("content", []):
        if c.get("type") == "tool_use":
            return c.get("input") or {}
    raise ScanError("scan_ai_failed")


# ---------- sanitising (never trust model output) ----------
def _s(v, n: int) -> str | None:
    if v is None:
        return None
    v = str(v).strip()
    return v[:n] or None


def _num(v, lo: float = 0, hi: float = 999_999_999) -> str | None:
    if v is None or v == "":
        return None
    try:
        d = Decimal(str(v).replace(",", ".").replace(" ", ""))
    except InvalidOperation:
        return None
    if not d.is_finite() or d < Decimal(str(lo)) or d > Decimal(str(hi)):
        return None
    txt = f"{d.quantize(Decimal('0.001')):f}"  # plain notation (normalize() would give 1.5E+3)
    return txt.rstrip("0").rstrip(".") if "." in txt else txt


def _date(v) -> str | None:
    if not v:
        return None
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", str(v).strip())
    if not m:
        return None
    try:
        return date(int(m[1]), int(m[2]), int(m[3])).isoformat()
    except ValueError:
        return None


def _clean_sales(raw: dict) -> dict:
    c = raw.get("client") if isinstance(raw.get("client"), dict) else {}
    items = []
    for it in (raw.get("items") or [])[:300]:
        if not isinstance(it, dict) or not _s(it.get("designation"), 255):
            continue
        items.append({
            "item_type": it.get("item_type") if it.get("item_type") in ITEM_TYPES else "material",
            "designation": _s(it.get("designation"), 255),
            "description": _s(it.get("description"), 2000),
            "quantity": _num(it.get("quantity"), 0.001) or "1",
            "unit": it.get("unit") if it.get("unit") in UNITS else "u",
            "unit_price_ht": _num(it.get("unit_price_ht")) or "0",
            "discount": _num(it.get("discount")) or "0",
            "tva_rate": _num(it.get("tva_rate"), 0, 100),
        })
    return {
        "document_number": _s(raw.get("document_number"), 64),
        "client": {k: _s(c.get(k), 255) for k in ("name", "phone", "email", "address", "city", "tax_id")},
        "title": _s(raw.get("title"), 255),
        "site_address": _s(raw.get("site_address"), 255),
        "issue_date": _date(raw.get("issue_date")),
        "second_date": _date(raw.get("second_date")),
        "payment_terms": _s(raw.get("payment_terms"), 5000),
        "notes": _s(raw.get("notes"), 5000),
        "apply_stamp_duty": raw.get("apply_stamp_duty") if isinstance(raw.get("apply_stamp_duty"), bool) else None,
        "items": items,
        "total_ht": _num(raw.get("total_ht")),
        "total_ttc": _num(raw.get("total_ttc")),
    }


def _clean_payment(raw: dict) -> dict:
    return {
        "amount": _num(raw.get("amount"), 0.001),
        "payment_date": _date(raw.get("payment_date")),
        "method": raw.get("method") if raw.get("method") in ("cash", "cheque", "transfer", "card", "traite", "other") else None,
        "reference": _s(raw.get("reference"), 120),
        "invoice_number": _s(raw.get("invoice_number"), 64),
        "payer_name": _s(raw.get("payer_name"), 255),
        "comment": _s(raw.get("comment"), 2000),
    }


def extract(data: bytes, mime: str, target: str) -> dict | None:
    """Return cleaned data, or None when the AI reader is not configured."""
    if not ai_enabled():
        return None
    raw = _call_claude(data, mime, target)
    if not isinstance(raw, dict):
        raise ScanError("scan_ai_failed")
    return _clean_payment(raw) if target == "payment" else _clean_sales(raw)


