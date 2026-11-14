"""PDF generation for quotes, invoices and financial reports (French LTR / Arabic RTL).

Uses ReportLab. Arabic text is shaped with arabic_reshaper and reordered with python-bidi,
then right-aligned; tables are mirrored so that the reading order starts on the right.
"""
from __future__ import annotations

import io
import re
from decimal import Decimal
from pathlib import Path
from xml.sax.saxutils import escape

import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.graphics.shapes import Drawing, Polygon, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Image,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.services.i18n_pdf import LABELS

FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"
pdfmetrics.registerFont(TTFont("F2A", str(FONT_DIR / "DejaVuSans.ttf")))
pdfmetrics.registerFont(TTFont("F2A-Bold", str(FONT_DIR / "DejaVuSans-Bold.ttf")))
pdfmetrics.registerFontFamily("F2A", normal="F2A", bold="F2A-Bold", italic="F2A", boldItalic="F2A-Bold")

BLUE = colors.HexColor("#174B83")
NAVY = colors.HexColor("#172B45")
ORANGE = colors.HexColor("#E9A12C")
LIGHT = colors.HexColor("#F3F6FA")
BORDER = colors.HexColor("#D5DEEA")
GREY = colors.HexColor("#5B6B80")
NBSP = "\u00a0"
_DIGIT_SPACE = re.compile(r"(?<=[\d+]) (?=[\d+])")
_LTR_NUMBER = re.compile(r"\+?\d[\d\u00a0,./:-]*\d|\+?\d")

PAGE_W, PAGE_H = A4
MARGIN = 15 * mm
CONTENT_W = PAGE_W - 2 * MARGIN


def fmt_money(value, lang: str = "fr", currency: bool = True) -> str:
    d = Decimal(str(value or 0)).quantize(Decimal("0.001"))
    sign = "-" if d < 0 else ""
    integer, frac = f"{abs(d):.3f}".split(".")
    groups = []
    while integer:
        groups.insert(0, integer[-3:])
        integer = integer[:-3]
    s = f"{sign}{NBSP.join(groups)},{frac}"
    if currency:
        s += " " + LABELS[lang]["currency"]
    return s


def fmt_qty(value) -> str:
    d = Decimal(str(value)).normalize()
    s = f"{d:f}"
    return s.replace(".", ",")


def fmt_date(d, lang: str = "fr") -> str:
    return d.strftime("%d/%m/%Y") if d else ""


class Writer:
    """Language aware helpers to build paragraphs."""

    def __init__(self, lang: str):
        self.lang = lang if lang in LABELS else "fr"
        self.rtl = self.lang == "ar"
        self.L = LABELS[self.lang]
        align = TA_RIGHT if self.rtl else TA_LEFT
        self.base = ParagraphStyle("base", fontName="F2A", fontSize=8.5, leading=11.5, alignment=align, textColor=NAVY)
        self.small = ParagraphStyle("small", parent=self.base, fontSize=7.5, leading=10, textColor=GREY)
        self.bold = ParagraphStyle("bold", parent=self.base, fontName="F2A-Bold")
        self.h_title = ParagraphStyle("title", parent=self.base, fontName="F2A-Bold", fontSize=20, leading=24,
                                      textColor=BLUE, alignment=TA_LEFT if self.rtl else TA_RIGHT)
        self.section = ParagraphStyle("section", parent=self.base, fontName="F2A-Bold", fontSize=9.5, leading=13,
                                      textColor=BLUE, spaceBefore=4, spaceAfter=2)
        self.th = ParagraphStyle("th", parent=self.base, fontName="F2A-Bold", fontSize=7.5, leading=9.5,
                                 textColor=colors.white, alignment=TA_CENTER)
        self.cell = ParagraphStyle("cell", parent=self.base, fontSize=7.8, leading=10)
        self.num = ParagraphStyle("num", parent=self.cell, alignment=TA_LEFT if self.rtl else TA_RIGHT)
        self.center = ParagraphStyle("center", parent=self.cell, alignment=TA_CENTER)

    def shape(self, text: str) -> str:
        if not text:
            return ""
        if any("؀" <= ch <= "ۿ" for ch in text):
            # keep numbers such as "+216 22 111 222" or "1 234,500" as a single LTR run
            text = _DIGIT_SPACE.sub(NBSP, text)
            text = _LTR_NUMBER.sub(lambda m: "\u202a" + m.group(0) + "\u202c", text)
            return get_display(arabic_reshaper.reshape(text))
        return text

    def _wrap_logical(self, text: str, font: str, size: float, width: float) -> list[str]:
        lines: list[str] = []
        for raw in text.split("\n"):
            words = raw.split(" ")
            cur = ""
            for w in words:
                test = (cur + " " + w).strip()
                if pdfmetrics.stringWidth(self.shape(test), font, size) <= width or not cur:
                    cur = test
                else:
                    lines.append(cur)
                    cur = w
            lines.append(cur)
        return lines

    def p(self, text, style: ParagraphStyle | None = None, width: float | None = None) -> Paragraph:
        style = style or self.base
        text = "" if text is None else str(text)
        if self.rtl and any("؀" <= ch <= "ۿ" for ch in text):
            # Wrap in logical order first, then reorder each visual line (keeps line order correct)
            width = width or CONTENT_W
            lines = self._wrap_logical(text, style.fontName, style.fontSize, width - 4)
            html = "<br/>".join(escape(self.shape(l)) for l in lines)
        else:
            html = escape(text).replace("\n", "<br/>")
        return Paragraph(html, style)

    def row(self, cells: list) -> list:
        return list(reversed(cells)) if self.rtl else cells


DEFAULT_LOGO = Path(__file__).resolve().parent.parent / "assets" / "logo-f2a.png"


def _logo_flowable(logo_path: str | None, height: float = 22 * mm):
    # No logo uploaded in Paramètres → use the official F2A logo bundled with the app
    if not (logo_path and Path(logo_path).exists()) and DEFAULT_LOGO.exists():
        logo_path = str(DEFAULT_LOGO)
    if logo_path and Path(logo_path).exists():
        try:
            img = Image(logo_path)
            ratio = img.imageWidth / float(img.imageHeight)
            img.drawHeight = height
            img.drawWidth = min(height * ratio, 60 * mm)
            return img
        except Exception:  # noqa: BLE001 - fall back to drawn logo
            pass
    w = 46 * mm
    d = Drawing(w, height)
    d.add(Rect(0, 0, height, height, rx=3 * mm, ry=3 * mm, fillColor=BLUE, strokeColor=None))
    # orange flame / drop
    cx, top = height * 0.72, height * 0.88
    d.add(Polygon([cx, top, cx + 3.2 * mm, top - 5.5 * mm, cx, top - 8 * mm, cx - 3.2 * mm, top - 5.5 * mm],
                  fillColor=ORANGE, strokeColor=None))
    d.add(String(height * 0.12, height * 0.22, "F2A", fontName="F2A-Bold", fontSize=height * 0.42 / mm * 2.2,
                 fillColor=colors.white))
    d.add(String(height + 2.5 * mm, height * 0.55, "F2A TRAVAUX", fontName="F2A-Bold", fontSize=10.5, fillColor=NAVY))
    d.add(String(height + 2.5 * mm, height * 0.25, "Fluides & Travaux", fontName="F2A", fontSize=7.5, fillColor=ORANGE))
    return d


def _footer_cb(writer: Writer, footer_text: str, company_line: str):
    def draw(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(ORANGE)
        canvas.setLineWidth(1.2)
        canvas.line(MARGIN, 16 * mm, PAGE_W - MARGIN, 16 * mm)
        canvas.setFont("F2A", 7)
        canvas.setFillColor(GREY)
        if footer_text:
            canvas.drawCentredString(PAGE_W / 2, 12 * mm, writer.shape(footer_text)[:180])
        canvas.drawCentredString(PAGE_W / 2, 8.5 * mm, writer.shape(company_line)[:200])
        page_txt = f"{doc.page}"
        label = writer.shape(writer.L["page"]) + " " + page_txt if not writer.rtl else page_txt + " " + writer.shape(writer.L["page"])
        if writer.rtl:
            canvas.drawString(MARGIN, 8.5 * mm, label)
        else:
            canvas.drawRightString(PAGE_W - MARGIN, 8.5 * mm, label)
        # top band
        canvas.setFillColor(BLUE)
        canvas.rect(0, PAGE_H - 5 * mm, PAGE_W, 5 * mm, stroke=0, fill=1)
        canvas.setFillColor(ORANGE)
        canvas.rect(0, PAGE_H - 6.2 * mm, PAGE_W, 1.2 * mm, stroke=0, fill=1)
        canvas.restoreState()

    return draw


def _company_block(w: Writer, cs) -> list:
    tagline = cs.tagline_ar if w.rtl else cs.tagline_fr
    parts = [w.p(cs.name, w.bold)]
    if tagline:
        parts.append(w.p(tagline, w.small))
    lines = []
    if cs.address:
        lines.append(f"{cs.address}{', ' + cs.city if cs.city else ''}")
    if cs.phone:
        lines.append(f"{w.L['phone']}: {cs.phone}")
    if cs.email:
        lines.append(f"{w.L['email']}: {cs.email}")
    if cs.tax_id:
        lines.append(f"{w.L['tax_id']}: {cs.tax_id}")
    if cs.trade_register:
        lines.append(f"{w.L['rc']}: {cs.trade_register}")
    for l in lines:
        parts.append(w.p(l, w.small, width=CONTENT_W * 0.5))
    return parts


def _header(w: Writer, cs, logo_path, title: str, meta: list[tuple[str, str]]) -> Table:
    left = [_logo_flowable(logo_path), Spacer(1, 2 * mm), *_company_block(w, cs)]
    right = [Paragraph(escape(w.shape(title)), w.h_title), Spacer(1, 2 * mm)]
    meta_rows = [w.row([w.p(k, w.small), w.p(v, w.bold)]) for k, v in meta]
    mt = Table(meta_rows, colWidths=w.row([30 * mm, 40 * mm]))
    mt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
    ]))
    right.append(mt)
    cols = w.row([left, right])
    t = Table([cols], colWidths=w.row([CONTENT_W * 0.55, CONTENT_W * 0.45]))
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1 if not w.rtl else 0, 0), (1 if not w.rtl else 0, 0), "RIGHT" if not w.rtl else "LEFT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t


def _client_box(w: Writer, client, extra: list[tuple[str, str]]) -> Table:
    lines = [w.p(w.L["client"], w.section), w.p(client.name, w.bold)]
    for label, val in [
        (w.L["address"], ", ".join(x for x in [client.address, client.city] if x)),
        (w.L["phone"], client.phone), (w.L["email"], client.email), (w.L["tax_id"], client.tax_id),
    ]:
        if val:
            lines.append(w.p(f"{label}: {val}", w.small, width=CONTENT_W * 0.5))
    info = []
    for label, val in extra:
        if val:
            info.append(w.p(f"{label}: {val}", w.base, width=CONTENT_W * 0.45))
    cols = w.row([info, lines])
    t = Table([cols], colWidths=w.row([CONTENT_W * 0.5, CONTENT_W * 0.5]))
    client_col = 0 if w.rtl else 1
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (client_col, 0), (client_col, 0), 0.8, BLUE),
        ("BACKGROUND", (client_col, 0), (client_col, 0), LIGHT),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def _items_table(w: Writer, items) -> Table:
    L = w.L
    widths = [7 * mm, 62 * mm, 14 * mm, 12 * mm, 21 * mm, 16 * mm, 12 * mm, 18 * mm, 18 * mm]
    head = [L["col_n"], L["col_designation"], L["col_qty"], L["col_unit"], L["col_pu"], L["col_discount"],
            L["col_tva"], L["col_ht"], L["col_ttc"]]
    rows = [w.row([w.p(h, w.th, width=widths[i]) for i, h in enumerate(head)])]
    for i, it in enumerate(items, 1):
        type_label = L.get(f"type_{it.item_type}", "")
        desig = [w.p(it.designation, w.bold, width=widths[1])]
        sub = " — ".join(x for x in [type_label, it.description or ""] if x)
        if sub:
            desig.append(w.p(sub, w.small, width=widths[1]))
        rows.append(w.row([
            w.p(str(i), w.center), desig, w.p(fmt_qty(it.quantity), w.center), w.p(it.unit, w.center),
            w.p(fmt_money(it.unit_price_ht, w.lang, False), w.num),
            w.p(fmt_money(it.discount, w.lang, False) if it.discount else "—", w.num),
            w.p(fmt_qty(it.tva_rate), w.center), w.p(fmt_money(it.total_ht, w.lang, False), w.num),
            w.p(fmt_money(it.total_ttc, w.lang, False), w.num),
        ]))
    t = Table(rows, colWidths=w.row(widths), repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BLUE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, BORDER),
        ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def _totals_table(w: Writer, rows: list[tuple[str, str, bool]]) -> Table:
    data = []
    for label, val, strong in rows:
        st = w.bold if strong else w.base
        data.append(w.row([w.p(label, st), w.p(val, ParagraphStyle("tv", parent=st, alignment=TA_LEFT if w.rtl else TA_RIGHT))]))
    t = Table(data, colWidths=w.row([45 * mm, 35 * mm]))
    style = [
        ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    for i, (_, _, strong) in enumerate(rows):
        if strong:
            style += [("BACKGROUND", (0, i), (-1, i), LIGHT)]
    # highlight last row (net / balance) in orange
    style += [("BACKGROUND", (0, len(rows) - 1), (-1, len(rows) - 1), ORANGE)]
    t.setStyle(TableStyle(style))
    outer = Table([w.row([Spacer(1, 1), t])], colWidths=w.row([CONTENT_W - 80 * mm, 80 * mm]))
    outer.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    return outer


def _tva_rows(w: Writer, doc) -> list[tuple[str, str, bool]]:
    breakdown: dict[Decimal, Decimal] = {}
    for it in doc.items:
        breakdown[Decimal(it.tva_rate)] = breakdown.get(Decimal(it.tva_rate), Decimal(0)) + Decimal(it.total_tva)
    rows = []
    for rate in sorted(breakdown):
        if breakdown[rate] or len(breakdown) == 1:
            rows.append((f"{w.L['tva']} {fmt_qty(rate)}%", fmt_money(breakdown[rate], w.lang), False))
    return rows


def _signatures(w: Writer, with_client: bool = True) -> Table:
    box_h = 26 * mm
    left = [w.p(w.L["signature_company"], w.bold), Spacer(1, box_h)]
    right = [w.p(w.L["signature_client"], w.bold), Spacer(1, box_h)] if with_client else [Spacer(1, 1)]
    t = Table([w.row([right, left])], colWidths=[CONTENT_W / 2 - 3 * mm, CONTENT_W / 2 - 3 * mm], hAlign="CENTER")
    style = [("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 5)]
    style += [("BOX", (0, 0), (0, 0), 0.6, BORDER), ("BOX", (1, 0), (1, 0), 0.6, BORDER)] if with_client else \
        [("BOX", (1 if not w.rtl else 0, 0), (1 if not w.rtl else 0, 0), 0.6, BORDER)]
    t.setStyle(TableStyle(style))
    return KeepTogether([Spacer(1, 6 * mm), t])


def _text_section(w: Writer, title: str, text: str | None) -> list:
    if not text:
        return []
    return [w.p(title, w.section), w.p(text, w.small)]


def _bank(w: Writer, cs) -> list:
    parts = [x for x in [cs.bank_name, f"RIB: {cs.bank_rib}" if cs.bank_rib else None,
                         f"IBAN: {cs.bank_iban}" if cs.bank_iban else None] if x]
    return _text_section(w, w.L["bank"], " — ".join(parts)) if parts else []


def _build(story: list, w: Writer, cs, title: str) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=12 * mm,
                            bottomMargin=20 * mm, title=title, author=cs.name, creator="F2A MANAGER")
    footer = (cs.footer_ar if w.rtl else cs.footer_fr) or ""
    company_line = " • ".join(x for x in [cs.name, cs.phone, cs.email, cs.tax_id] if x)
    cb = _footer_cb(w, footer, company_line)
    doc.build(story, onFirstPage=cb, onLaterPages=cb)
    return buf.getvalue()


def method_label(cs, code: str, lang: str) -> str:
    for m in cs.payment_methods or []:
        if m.get("code") == code:
            return m.get("label_ar" if lang == "ar" else "label_fr", code)
    return code


def render_quote_pdf(quote, cs, lang: str = "fr", logo_path: str | None = None) -> bytes:
    w = Writer(lang)
    L = w.L
    story = [
        _header(w, cs, logo_path, L["quote"], [
            (L["number"], quote.number), (L["date"], fmt_date(quote.issue_date)),
            (L["validity"], fmt_date(quote.validity_date)),
        ]),
        Spacer(1, 6 * mm),
        _client_box(w, quote.client, [(L["object"], quote.title), (L["site"], quote.site_address)]),
        Spacer(1, 5 * mm),
        _items_table(w, quote.items),
        Spacer(1, 4 * mm),
    ]
    rows = [(L["subtotal"], fmt_money(quote.subtotal_ht, lang), False)]
    if quote.total_discount:
        rows.append((L["discount"], "- " + fmt_money(quote.total_discount, lang), False))
    rows.append((L["total_ht"], fmt_money(quote.total_ht, lang), True))
    rows += _tva_rows(w, quote)
    rows.append((L["total_ttc"], fmt_money(quote.total_ttc, lang), True))
    story.append(KeepTogether(_totals_table(w, rows)))
    story.append(Spacer(1, 2 * mm))
    story.append(w.p(L["amount_words_note"], w.small))
    terms_default = cs.payment_terms_ar if w.rtl else cs.payment_terms_fr
    story += _text_section(w, L["payment_terms"], quote.payment_terms or terms_default)
    story += _text_section(w, L["special_conditions"], quote.special_conditions)
    story += _text_section(w, L["terms"], cs.terms_ar if w.rtl else cs.terms_fr)
    story += _bank(w, cs)
    story.append(_signatures(w, with_client=True))
    return _build(story, w, cs, f"{L['quote']} {quote.number}")


def render_invoice_pdf(invoice, cs, lang: str = "fr", logo_path: str | None = None) -> bytes:
    w = Writer(lang)
    L = w.L
    title = L["invoice"] + (f" — {L['cancelled']}" if invoice.status == "cancelled" else "")
    meta = [(L["number"], invoice.number), (L["date"], fmt_date(invoice.issue_date)),
            (L["due_date"], fmt_date(invoice.due_date))]
    if invoice.quote:
        meta.append((L["ref_quote"], invoice.quote.number))
    story = [
        _header(w, cs, logo_path, title, meta),
        Spacer(1, 6 * mm),
        _client_box(w, invoice.client, [(L["object"], invoice.title), (L["site"], invoice.site_address)]),
        Spacer(1, 5 * mm),
        _items_table(w, invoice.items),
        Spacer(1, 4 * mm),
    ]
    rows = [(L["subtotal"], fmt_money(invoice.subtotal_ht, lang), False)]
    if invoice.total_discount:
        rows.append((L["discount"], "- " + fmt_money(invoice.total_discount, lang), False))
    rows.append((L["total_ht"], fmt_money(invoice.total_ht, lang), True))
    rows += _tva_rows(w, invoice)
    rows.append((L["total_ttc"], fmt_money(invoice.total_ttc, lang), True))
    if invoice.stamp_duty:
        rows.append((L["stamp"], fmt_money(invoice.stamp_duty, lang), False))
        rows.append((L["net"], fmt_money(invoice.total_due, lang), True))
    rows.append((L["paid"], fmt_money(invoice.amount_paid, lang), False))
    rows.append((L["balance"], fmt_money(invoice.balance, lang), True))
    story.append(KeepTogether(_totals_table(w, rows)))
    story.append(Spacer(1, 2 * mm))
    story.append(w.p(L["amount_words_note"], w.small))

    valid = [p for p in invoice.payments if p.status == "valid"]
    if valid:
        story.append(w.p(L["payments"], w.section))
        widths = [25 * mm, 40 * mm, 40 * mm, 30 * mm]
        data = [w.row([w.p(h, w.th) for h in [L["pay_date"], L["pay_method"], L["pay_ref"], L["pay_amount"]]])]
        for p in valid:
            data.append(w.row([w.p(fmt_date(p.payment_date), w.center), w.p(method_label(cs, p.method, lang), w.cell),
                               w.p(p.reference or "—", w.cell), w.p(fmt_money(p.amount, lang), w.num)]))
        t = Table(data, colWidths=w.row(widths), hAlign="RIGHT" if w.rtl else "LEFT")
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), NAVY), ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
            ("LINEBELOW", (0, 0), (-1, -1), 0.3, BORDER),
            ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ]))
        story.append(t)
    terms_default = cs.payment_terms_ar if w.rtl else cs.payment_terms_fr
    story += _text_section(w, L["payment_terms"], invoice.payment_terms or terms_default)
    story += _bank(w, cs)
    story.append(_signatures(w, with_client=False))
    return _build(story, w, cs, f"{L['invoice']} {invoice.number}")


def render_report_pdf(report: dict, cs, lang: str = "fr", logo_path: str | None = None) -> bytes:
    w = Writer(lang)
    L = w.L
    period = f"{fmt_date(report['date_from'])} → {fmt_date(report['date_to'])}"
    story = [_header(w, cs, logo_path, L["report"], [(L["period"], period)]), Spacer(1, 6 * mm)]
    s = report["summary"]
    story.append(_totals_table(w, [
        (L["invoiced"], fmt_money(s["invoiced"], lang), True),
        (L["collected"], fmt_money(s["collected"], lang), True),
        (L["outstanding"], fmt_money(s["outstanding"], lang), True),
    ]))
    story.append(Spacer(1, 2 * mm))
    story.append(w.p(L["report_note"], w.small))

    def table(title, head, rows, widths):
        story.append(w.p(title, w.section))
        data = [w.row([w.p(h, w.th) for h in head])] + [w.row(r) for r in rows]
        t = Table(data, colWidths=w.row(widths), repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BLUE), ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]), ("LINEBELOW", (0, 0), (-1, -1), 0.3, BORDER),
        ]))
        story.append(t)

    table(L["by_month"], [L["month"], L["invoiced"], L["collected"]],
          [[w.p(m["month"], w.cell), w.p(fmt_money(m["invoiced"], lang), w.num), w.p(fmt_money(m["collected"], lang), w.num)]
           for m in report["by_month"]], [40 * mm, 70 * mm, 70 * mm])
    table(L["by_client"], [L["client"], L["invoiced"], L["collected"], L["balance"]],
          [[w.p(c["name"], w.cell), w.p(fmt_money(c["invoiced"], lang), w.num), w.p(fmt_money(c["collected"], lang), w.num),
            w.p(fmt_money(c["balance"], lang), w.num)] for c in report["by_client"]],
          [60 * mm, 40 * mm, 40 * mm, 40 * mm])
    table(L["by_method"], [L["pay_method"], L["count"], L["pay_amount"]],
          [[w.p(method_label(cs, m["method"], lang), w.cell), w.p(str(m["count"]), w.center), w.p(fmt_money(m["amount"], lang), w.num)]
           for m in report["by_method"]], [80 * mm, 30 * mm, 70 * mm])
    table(L["unpaid_invoices"], [L["number"], L["client"], L["due_date"], L["net"], L["balance"]],
          [[w.p(i["number"], w.cell), w.p(i["client"], w.cell), w.p(fmt_date(i["due_date"]), w.center),
            w.p(fmt_money(i["total_due"], lang), w.num), w.p(fmt_money(i["balance"], lang), w.num)] for i in report["unpaid"]],
          [30 * mm, 60 * mm, 25 * mm, 32 * mm, 33 * mm])
    return _build(story, w, cs, L["report"])
