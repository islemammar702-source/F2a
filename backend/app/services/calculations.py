"""Server-side monetary calculations. All amounts use Decimal with 3 decimals (TND millimes).

Rules:
    line HT  = quantity × unit price HT − discount
    line TVA = line HT × rate / 100
    line TTC = line HT + line TVA
    total HT = Σ line HT ; TVA = Σ line TVA ; TTC = HT + TVA
"""
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

Q3 = Decimal("0.001")
ZERO = Decimal("0.000")


def r3(value: Decimal | int | float | str) -> Decimal:
    return Decimal(str(value)).quantize(Q3, rounding=ROUND_HALF_UP)


class CalculationError(ValueError):
    pass


@dataclass
class LineResult:
    gross_ht: Decimal
    discount: Decimal
    total_ht: Decimal
    total_tva: Decimal
    total_ttc: Decimal


@dataclass
class TotalsResult:
    subtotal_ht: Decimal = ZERO
    total_discount: Decimal = ZERO
    total_ht: Decimal = ZERO
    total_tva: Decimal = ZERO
    total_ttc: Decimal = ZERO
    lines: list[LineResult] = field(default_factory=list)
    tva_breakdown: dict[str, dict[str, Decimal]] = field(default_factory=dict)


def compute_line(quantity: Decimal, unit_price_ht: Decimal, discount: Decimal, tva_rate: Decimal) -> LineResult:
    quantity, unit_price_ht, discount, tva_rate = map(Decimal, map(str, (quantity, unit_price_ht, discount, tva_rate)))
    if quantity <= 0:
        raise CalculationError("quantity_must_be_positive")
    if unit_price_ht < 0:
        raise CalculationError("price_must_be_positive")
    if discount < 0:
        raise CalculationError("discount_must_be_positive")
    if tva_rate < 0 or tva_rate > 100:
        raise CalculationError("invalid_tva_rate")
    gross = r3(quantity * unit_price_ht)
    discount = r3(discount)
    if discount > gross:
        raise CalculationError("discount_exceeds_amount")
    total_ht = r3(gross - discount)
    total_tva = r3(total_ht * tva_rate / Decimal(100))
    return LineResult(gross, discount, total_ht, total_tva, r3(total_ht + total_tva))


def compute_totals(lines: list[dict]) -> TotalsResult:
    """lines: dicts with quantity, unit_price_ht, discount, tva_rate."""
    res = TotalsResult()
    for line in lines:
        lr = compute_line(line["quantity"], line["unit_price_ht"], line.get("discount") or 0, line["tva_rate"])
        res.lines.append(lr)
        res.subtotal_ht += lr.gross_ht
        res.total_discount += lr.discount
        res.total_ht += lr.total_ht
        res.total_tva += lr.total_tva
        key = str(r3(line["tva_rate"]).normalize())
        b = res.tva_breakdown.setdefault(key, {"base": ZERO, "tva": ZERO})
        b["base"] += lr.total_ht
        b["tva"] += lr.total_tva
    res.subtotal_ht = r3(res.subtotal_ht)
    res.total_discount = r3(res.total_discount)
    res.total_ht = r3(res.total_ht)
    res.total_tva = r3(res.total_tva)
    res.total_ttc = r3(res.total_ht + res.total_tva)
    return res


def invoice_payment_status(total_due: Decimal, paid: Decimal, overdue: bool, cancelled: bool) -> str:
    if cancelled:
        return "cancelled"
    if paid >= total_due and total_due > 0:
        return "paid"
    if overdue:
        return "overdue"
    if paid > 0:
        return "partial"
    return "unpaid"
