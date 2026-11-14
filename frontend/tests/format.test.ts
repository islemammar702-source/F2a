// Unit tests for client-side formatting & calculation helpers (run with: npm test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { documentTotals, formatAmount, lineTotals, round3, waLink } from "../src/lib/format.ts";

test("line totals follow HT = qty × PU − discount", () => {
  const r = lineTotals({ quantity: "4", unit_price_ht: "220", discount: "80", tva_rate: "19" });
  assert.deepEqual(r, { gross: 880, ht: 800, tva: 152, ttc: 952 });
});

test("document totals with several VAT rates", () => {
  const t = documentTotals([
    { quantity: 1, unit_price_ht: 1850, discount: 0, tva_rate: 19 },
    { quantity: 4, unit_price_ht: 220, discount: 80, tva_rate: 19 },
    { quantity: 1, unit_price_ht: 100, discount: 0, tva_rate: 7 },
  ]);
  assert.equal(t.ht, 2750);
  assert.equal(t.tva, 510.5);
  assert.equal(t.ttc, 3260.5);
  assert.equal(t.byRate.get(19), 503.5);
});

test("3-decimal rounding (millimes)", () => {
  assert.equal(round3(1.0005), 1.001);
  assert.equal(round3(0.1 + 0.2), 0.3);
});

test("TND formatting has 3 decimals in both languages", () => {
  assert.match(formatAmount(2500, "fr"), /^2\s?500,000$/u);
  assert.match(formatAmount(2500, "ar"), /2.?500,000/u);
  assert.ok(!/[٠-٩]/.test(formatAmount(1234.5, "ar")), "Arabic uses Latin digits");
});

test("WhatsApp link keeps only digits", () => {
  assert.equal(waLink("+216 22 111 222", "Bonjour"), "https://wa.me/21622111222?text=Bonjour");
});
