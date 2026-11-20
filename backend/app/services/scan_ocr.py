"""Free, offline reading of scanned documents with Tesseract OCR (no internet, no API key).

1. text extraction: PDF text layer (pdftotext) or OCR of the image / PDF pages (tesseract fra+ara)
2. simple rules to find dates, amounts, totals, document number, client details and table lines

Less precise than an AI reader (lines of a table are only kept when quantity × price = line total),
so the user always checks the pre-filled form before saving.
"""
import io
import logging
import re
import shutil
import subprocess
import tempfile
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path

log = logging.getLogger("f2a.ocr")

LANGS = "fra+ara"
TIMEOUT = 90


def available() -> bool:
    return shutil.which("tesseract") is not None


# ---------------------------------------------------------------- text extraction
def _prepare(img_bytes: bytes) -> bytes:
    """Straighten (EXIF), grey scale, enlarge small photos, boost contrast → better OCR."""
    from PIL import Image, ImageOps

    im = ImageOps.exif_transpose(Image.open(io.BytesIO(img_bytes)))
    im = ImageOps.grayscale(im)
    if im.width < 1600:
        f = 1600 / im.width
        im = im.resize((1600, int(im.height * f)))
    elif im.width > 3000:
        im.thumbnail((3000, 3000 * 3))
    im = ImageOps.autocontrast(im)
    out = io.BytesIO()
    im.save(out, "PNG")
    return out.getvalue()


def _tesseract(png: bytes) -> str:
    r = subprocess.run(["tesseract", "stdin", "stdout", "-l", LANGS, "--psm", "6"], input=png,
                       capture_output=True, timeout=TIMEOUT)
    return r.stdout.decode("utf-8", "ignore")


def extract_text(data: bytes, mime: str) -> str:
    if mime != "application/pdf":
        return _tesseract(_prepare(data))
    with tempfile.TemporaryDirectory() as tmp:
        pdf = Path(tmp) / "in.pdf"
        pdf.write_bytes(data)
        # 1) PDF produced by a software: real text, no OCR needed
        if shutil.which("pdftotext"):
            r = subprocess.run(["pdftotext", "-layout", "-l", "3", str(pdf), "-"], capture_output=True, timeout=TIMEOUT)
            txt = r.stdout.decode("utf-8", "ignore")
            if len(re.sub(r"\s", "", txt)) > 40:
                return txt
        # 2) scanned PDF: render the first pages and OCR them
        if not shutil.which("pdftoppm"):
            return ""
        subprocess.run(["pdftoppm", "-r", "200", "-l", "3", "-png", str(pdf), str(Path(tmp) / "p")], capture_output=True, timeout=TIMEOUT)
        return "\n".join(_tesseract(_prepare(p.read_bytes())) for p in sorted(Path(tmp).glob("p*.png")))


# ---------------------------------------------------------------- parsing helpers
_NUM = r"\d{1,3}(?:[ .  ]\d{3})+(?:[.,]\d{1,3})?|\d+(?:[.,]\d{1,3})?"
MONEY_RE = re.compile(rf"(?<![\w/.-])({_NUM})(?![\w/])")
DATE_RES = [
    (re.compile(r"\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b"), ("d", "m", "y")),
    (re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b"), ("y", "m", "d")),
    (re.compile(r"\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2})\b"), ("d", "m", "yy")),
]
MONTHS = {"janv": 1, "févr": 2, "fevr": 2, "mars": 3, "avr": 4, "mai": 5, "juin": 6, "juil": 7, "août": 8, "aout": 8,
          "sept": 9, "oct": 10, "nov": 11, "déc": 12, "dec": 12}
DATE_WORDS = re.compile(r"\b(\d{1,2})\s+(" + "|".join(MONTHS) + r")[a-zéû.]*\s+(\d{4})\b", re.I)


def parse_money(s: str) -> Decimal | None:
    s = s.strip().replace(" ", " ").replace(" ", " ")
    if not s:
        return None
    s = re.sub(r"(?<=\d) (?=\d{3}\b)", "", s)  # "1 250,500" → "1250,500"
    if "," in s and "." in s:  # the last separator is the decimal one
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif s.count(".") > 1:
        s = s.replace(".", "")
    elif s.count(",") > 1:
        s = s.replace(",", "")
    else:
        s = s.replace(",", ".")  # single separator = decimal (dinars have 3 decimals)
    try:
        d = Decimal(s)
    except InvalidOperation:
        return None
    return d if d.is_finite() else None


def _iso(y: int, m: int, d: int) -> str | None:
    try:
        return date(y, m, d).isoformat() if 2000 <= y <= 2100 else None
    except ValueError:
        return None


def find_dates(text: str) -> list[tuple[int, str]]:
    """All dates with their position in the text."""
    found: list[tuple[int, str]] = []
    for rx, order in DATE_RES:
        for m in rx.finditer(text):
            v = dict(zip(order, (int(g) for g in m.groups())))
            y = v.get("y") or 2000 + v["yy"]
            iso = _iso(y, v["m"], v["d"])
            if iso and not any(p == m.start() for p, _ in found):
                found.append((m.start(), iso))
    for m in DATE_WORDS.finditer(text):
        mon = next((n for k, n in MONTHS.items() if m.group(2).lower().startswith(k)), None)
        iso = _iso(int(m.group(3)), mon, int(m.group(1))) if mon else None
        if iso:
            found.append((m.start(), iso))
    return sorted(found)


def _amount_after(text: str, keywords: str) -> Decimal | None:
    """Amount written on the same line after one of the keywords (last one found wins: grand totals are at the end)."""
    best = None
    for line in text.splitlines():
        m = re.search(keywords, line, re.I)
        if not m:
            continue
        nums = [parse_money(x) for x in MONEY_RE.findall(line[m.end():])]
        nums = [n for n in nums if n is not None and n > 0]
        if nums:
            best = nums[-1]
    return best


def _date_near(text: str, keywords: str) -> str | None:
    for line in text.splitlines():
        if re.search(keywords, line, re.I):
            d = find_dates(line)
            if d:
                return d[0][1]
    return None


PHONE_RE = re.compile(r"(?:\+?216[\s.]?)?\b(\d{2}[\s.]?\d{3}[\s.]?\d{3})\b")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
MF_RE = re.compile(r"\b(\d{7}\s?[A-Z](?:\s?/\s?[A-Z]\s?/\s?[A-Z]\s?/\s?\d{3})?)\b")
UNIT_MAP = {"u": "u", "un": "u", "unite": "u", "unité": "u", "pce": "u", "pc": "u", "pcs": "u", "piece": "u", "pièce": "u",
            "ens": "lot", "ensemble": "lot", "lot": "lot", "ml": "ml", "m": "ml", "m2": "m2", "m²": "m2", "m3": "m3", "m³": "m3",
            "mi": "ml", "kg": "kg", "h": "h", "heure": "h", "heures": "h", "j": "j", "jour": "j", "jours": "j", "forfait": "forfait", "ff": "forfait"}
SKIP_LINE = re.compile(r"total|tva|timbre|net\s*à\s*payer|montant|remise|arr[eê]t[ée]|sous[-\s]?total|solde|acompte|r[ée]f[ée]rence|d[ée]signation", re.I)
LABOR = re.compile(r"main[-\s]?d['’]?\s?(?:oe|œ)uvre|pose|install|montage|mise en service|d[ée]placement|journ[ée]e", re.I)
SERVICE = re.compile(r"forfait|entretien|maintenance|[ée]tude|contr[oô]le|nettoyage|d[ée]pannage", re.I)
CURRENCY_RE = re.compile(r"€|\$|\b(?:eur|euros?|dt|tnd|dinars?)\b|د\.?ت", re.I)
PCT_RE = re.compile(r"(\d{1,2}(?:[.,]\d{1,2})?)\s*%")


def _close(a: Decimal, b: Decimal) -> bool:
    return abs(a - b) <= max(Decimal("0.02"), b * Decimal("0.02"))


def _parse_row(line: str) -> dict | None:
    """Find designation / quantity / unit / unit price in one table row.
    A row is accepted only when quantity × unit price matches a later figure (total HT or TTC)."""
    tva = PCT_RE.search(line)
    clean = CURRENCY_RE.sub(" ", PCT_RE.sub(" ", line))
    nums = [(m.start(), m.end(), parse_money(m.group(1))) for m in MONEY_RE.finditer(clean)]
    nums = [n for n in nums if n[2] is not None]
    rate = parse_money(tva.group(1)) if tva else None
    for i, (qs, qe, qty) in enumerate(nums):
        des = clean[:qs]
        if not re.search(r"[A-Za-zÀ-ÿ\u0600-\u06ff]{2}", des) or qty <= 0 or qty > 100000:
            continue
        for j in range(i + 1, len(nums)):
            pu = nums[j][2]
            for _, _, tot in nums[j + 1:]:
                ok_ht = _close(qty * pu, tot)
                ok_ttc = rate is not None and _close(qty * pu * (1 + rate / 100), tot)
                if (ok_ht or ok_ttc) and tot > 0:
                    unit_txt = clean[qe:nums[j][0]].strip().lower().rstrip(".")
                    return {
                        "designation": re.sub(r"[|_]+", " ", des).strip(" -:.\t")[:255],
                        "quantity": str(qty), "unit": UNIT_MAP.get(unit_txt, "u"), "unit_price_ht": str(pu),
                        "tva_rate": (f"{rate:f}".rstrip("0").rstrip(".") if "." in f"{rate:f}" else f"{rate:f}") if rate is not None else None,
                    }
    return None


def parse_lines(text: str) -> list[dict]:
    """Keep only table rows whose figures are consistent (qty × unit price ≈ line total)."""
    items = []
    for raw in text.splitlines():
        line = raw.strip()
        if len(line) < 6 or SKIP_LINE.search(line):
            continue
        row = _parse_row(line)
        if row and row["designation"]:
            des = row["designation"]
            row["item_type"] = "labor" if LABOR.search(des) else "service" if SERVICE.search(des) else "material"
            items.append(row)
    return items


CLIENT_KW = re.compile(r"\b(?:client|doit|destinataire|factur[ée]\s*à|à\s*l['’]attention\s*de|adress[ée]\s*à)\b", re.I)


def _client(text: str) -> dict:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    name = None
    for i, l in enumerate(lines):
        m = re.search(CLIENT_KW.pattern + r"\s*[:\-]?\s*(.*)", l, re.I)
        if m:
            name = m.group(1).strip(" :-") or (lines[i + 1] if i + 1 < len(lines) else None)
            break
    if not name:
        m = re.search(r"\b((?:st[ée]|soci[ée]t[ée]|m\.|mme|mr|monsieur|madame|r[ée]sidence|clinique|ets)\b[^\n]{2,60})", text, re.I)
        name = m.group(1).strip() if m else None
    if name:
        name = re.split(r"\s{3,}|\t|\b(?:t[ée]l|tel|mf|matricule|email|e-mail)\b", name, flags=re.I)[0].strip(" :-,")
    # Contact details: only those written AFTER the "Client" heading (the issuer's own phone / tax id come first).
    k = CLIENT_KW.search(text)
    part = text[k.start():] if k else ""
    phones = [p.replace(" ", "").replace(".", "") for p in PHONE_RE.findall(part)]
    mf = MF_RE.findall(part)
    emails = [e for e in EMAIL_RE.findall(part) if "f2a" not in e.lower()]
    return {
        "name": name[:255] if name and len(name) > 1 else None,
        "phone": phones[0] if phones else None,
        "email": emails[0] if emails else None,
        "tax_id": mf[0].replace(" ", "") if mf else None,
    }


# ---------------------------------------------------------------- public API
def parse_sales(text: str, kind: str) -> dict:
    dates = find_dates(text)
    second_kw = r"[ée]ch[ée]ance|validit[ée]|valable|due\s*date|à\s*r[ée]gler\s*avant" if kind == "invoice" else r"validit[ée]|valable|expire"
    second = _date_near(text, second_kw)
    issue = _date_near(text, r"\bdate\b|\ble\b\s+\d|du\s+\d") or next((d for _, d in dates if d != second), None)
    days = re.search(rf"(?:{second_kw})[^\n\d]{{0,25}}(\d{{1,3}})\s*jours", text, re.I)
    if not second and issue and days:  # "Validité : 15 jours" / "Échéance : 30 jours"
        second = (date.fromisoformat(issue) + timedelta(days=int(days.group(1)))).isoformat()
    num = re.search(r"\b(?:devis|facture|invoice|n[°ºo]\.?)\s*(?:n[°ºo]\.?)?\s*[:#]?\s*([A-Z]{0,5}[-/ ]?\d[\w\-/]{1,20})", text, re.I)
    tva = re.search(r"\btva\b[^\n%]{0,15}?(\d{1,2})(?:[.,]0+)?\s*%", text, re.I)
    items = parse_lines(text)
    for it in items:
        it["tva_rate"] = it["tva_rate"] or (tva.group(1) if tva else None)
    site = re.search(r"(?:chantier|lieu\s*des\s*travaux|adresse\s*des\s*travaux)\s*[:\-]?\s*([^\n]{3,120})", text, re.I)
    objet = re.search(r"\b(?:objet|travaux|d[ée]signation\s*des\s*travaux)\s*[:\-]\s*([^\n]{3,200})", text, re.I)
    return {
        "document_number": num.group(1).strip() if num else None,
        "client": _client(text),
        "title": objet.group(1).strip() if objet else None,
        "site_address": site.group(1).strip() if site else None,
        "issue_date": issue,
        "second_date": second if second != issue else None,
        "apply_stamp_duty": True if re.search(r"timbre", text, re.I) else None,
        "items": items,
        "total_ht": str(v) if (v := _amount_after(text, r"total\s*h\.?\s*t|montant\s*h\.?\s*t|net\s*h\.?\s*t")) else None,
        "total_ttc": str(v) if (v := _amount_after(text, r"net\s*à\s*payer|total\s*t\.?\s*t\.?\s*c|montant\s*t\.?\s*t\.?\s*c|total\s*g[ée]n[ée]ral")) else None,
    }


METHODS = [("cheque", r"ch[eèé]que|\bchq\b"), ("transfer", r"virement|\bvir\b|transfer|rib"), ("traite", r"traite|effet|lcr"),
           ("card", r"carte|\btpe\b|visa|mastercard"), ("cash", r"esp[eè]ces|cash|comptant")]


def parse_payment(text: str) -> dict:
    method = next((code for code, rx in METHODS if re.search(rx, text, re.I)), None)
    amount = _amount_after(text, r"montant|somme|total|net\s*à\s*payer|pay[ée]|re[çc]u|\bdt\b|\btnd\b|dinars?")
    if amount is None:  # fall back to the largest figure with decimals
        vals = [parse_money(x) for x in MONEY_RE.findall(text) if re.search(r"[.,]\d{1,3}$", x)]
        vals = [v for v in vals if v and v < 10_000_000]
        amount = max(vals) if vals else None
    ref = re.search(r"(?:ch[eèé]que|virement|r[ée]f[ée]rence|r[ée]f\.?|n[°ºo])\s*(?:n[°ºo]\.?)?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/]{3,30})", text, re.I)
    inv = re.search(r"\b((?:FAC|FA|F)[-/ ]?\d{2,4}[-/ ]?\d{1,6})\b", text, re.I)
    dates = find_dates(text)
    return {
        "amount": str(amount) if amount else None,
        "payment_date": dates[0][1] if dates else None,
        "method": method,
        "reference": ref.group(1) if ref else None,
        "invoice_number": inv.group(1).replace(" ", "-").upper() if inv else None,
    }


def read(data: bytes, mime: str, target: str) -> dict:
    text = extract_text(data, mime)
    log.info("OCR %s: %d characters", target, len(text))
    if len(text.strip()) < 10:
        return {"items": []} if target != "payment" else {}
    return parse_payment(text) if target == "payment" else parse_sales(text, target)
