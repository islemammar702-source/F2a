// Formatting helpers for TND amounts (3 decimals), quantities and dates in French / Arabic.
// Arabic uses Western (Latin) digits, as is customary in Tunisian business documents.

export type Lang = "fr" | "ar";

const LOCALE: Record<Lang, string> = { fr: "fr-TN", ar: "ar-TN-u-nu-latn" };

export function toNumber(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function formatAmount(v: unknown, lang: Lang = "fr"): string {
  return new Intl.NumberFormat(LOCALE[lang], { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(toNumber(v));
}

export function formatMoney(v: unknown, lang: Lang = "fr"): string {
  return `${formatAmount(v, lang)} ${lang === "ar" ? "د.ت" : "DT"}`;
}

export function formatCompact(v: unknown, lang: Lang = "fr"): string {
  return new Intl.NumberFormat(LOCALE[lang], { notation: "compact", maximumFractionDigits: 1 }).format(toNumber(v));
}

export function formatQty(v: unknown, lang: Lang = "fr"): string {
  return new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: 3 }).format(toNumber(v));
}

export function formatDate(v: string | Date | null | undefined, lang: Lang = "fr"): string {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v.length === 10 ? `${v}T00:00:00` : v) : v;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALE[lang], { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

export function formatDateTime(v: string | null | undefined, lang: Lang = "fr"): string {
  if (!v) return "—";
  return new Intl.DateTimeFormat(LOCALE[lang], { dateStyle: "short", timeStyle: "short" }).format(new Date(v));
}

export function formatMonth(ym: string, lang: Lang = "fr"): string {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat(LOCALE[lang], { month: "short", year: "2-digit" }).format(new Date(y, m - 1, 1));
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Client-side preview of line totals (mirrors backend rules; the server recomputes and is authoritative). */
export function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

export type LineLike = { quantity: unknown; unit_price_ht: unknown; discount?: unknown; tva_rate: unknown };

export function lineTotals(l: LineLike) {
  const gross = round3(toNumber(l.quantity) * toNumber(l.unit_price_ht));
  const ht = round3(gross - toNumber(l.discount));
  const tva = round3((ht * toNumber(l.tva_rate)) / 100);
  return { gross, ht, tva, ttc: round3(ht + tva) };
}

export function documentTotals(lines: LineLike[]) {
  let subtotal = 0, discount = 0, ht = 0, tva = 0;
  const byRate = new Map<number, number>();
  for (const l of lines) {
    const r = lineTotals(l);
    subtotal += r.gross;
    discount += toNumber(l.discount);
    ht += r.ht;
    tva += r.tva;
    const rate = toNumber(l.tva_rate);
    byRate.set(rate, round3((byRate.get(rate) ?? 0) + r.tva));
  }
  ht = round3(ht);
  tva = round3(tva);
  return { subtotal: round3(subtotal), discount: round3(discount), ht, tva, ttc: round3(ht + tva), byRate };
}

export function waLink(phone: string | null | undefined, text: string): string {
  const digits = (phone || "").replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
