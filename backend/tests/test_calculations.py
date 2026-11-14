"""Unit tests for monetary calculations (no database)."""
from decimal import Decimal as D

import pytest

from app.services.calculations import CalculationError, compute_line, compute_totals, invoice_payment_status, r3


def test_line_formula():
    lr = compute_line(D("4"), D("220"), D("80"), D("19"))
    assert lr.gross_ht == D("880.000")
    assert lr.total_ht == D("800.000")  # 4 × 220 − 80
    assert lr.total_tva == D("152.000")
    assert lr.total_ttc == D("952.000")


def test_rounding_three_decimals():
    lr = compute_line(D("3"), D("0.3335"), D("0"), D("19"))
    assert lr.total_ht == D("1.001")  # 1.0005 → half up
    assert lr.total_tva == D("0.190")


def test_totals_multi_rates():
    t = compute_totals([
        {"quantity": 1, "unit_price_ht": "1850", "discount": 0, "tva_rate": 19},
        {"quantity": 4, "unit_price_ht": "220", "discount": "80", "tva_rate": 19},
        {"quantity": 1, "unit_price_ht": "100", "discount": 0, "tva_rate": 7},
    ])
    assert t.subtotal_ht == D("2830.000")
    assert t.total_discount == D("80.000")
    assert t.total_ht == D("2750.000")
    assert t.total_tva == D("510.500")  # 2650 × 19% + 100 × 7% = 503.5 + 7
    assert t.total_ttc == D("3260.500")
    assert t.tva_breakdown["19"]["tva"] == D("503.500")


@pytest.mark.parametrize("q,p,d,r,err", [
    (0, 10, 0, 19, "quantity_must_be_positive"),
    (1, -1, 0, 19, "price_must_be_positive"),
    (1, 10, 11, 19, "discount_exceeds_amount"),
    (1, 10, 0, 120, "invalid_tva_rate"),
])
def test_line_validation(q, p, d, r, err):
    with pytest.raises(CalculationError, match=err):
        compute_line(D(q), D(p), D(d), D(r))


def test_payment_status_rules():
    assert invoice_payment_status(D("2500"), D("0"), False, False) == "unpaid"
    assert invoice_payment_status(D("2500"), D("1800"), False, False) == "partial"
    assert invoice_payment_status(D("2500"), D("2500"), True, False) == "paid"
    assert invoice_payment_status(D("2500"), D("1800"), True, False) == "overdue"
    assert invoice_payment_status(D("2500"), D("0"), False, True) == "cancelled"


def test_r3():
    assert r3("1.0005") == D("1.001")
    assert r3(2) == D("2.000")
