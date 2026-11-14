"use client";

import { Download, Eye, Printer } from "lucide-react";
import { useState } from "react";
import { downloadFile } from "@/lib/api";
import { formatMoney, formatQty, toNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Line, Money } from "@/lib/types";
import { useToast } from "./Toast";
import { Button, Select } from "./ui";

/** PDF actions: language choice, preview, download, print (authenticated fetch). */
export function PdfActions({ path, filename, defaultLang }: { path: string; filename: string; defaultLang: "fr" | "ar" }) {
  const { t } = useI18n();
  const toast = useToast();
  const [lang, setLang] = useState<"fr" | "ar">(defaultLang);
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (mode: "open" | "save" | "print") => {
    setBusy(mode);
    try {
      await downloadFile(`${path}?lang=${lang}${mode === "save" ? "&download=true" : ""}`, `${filename}-${lang}.pdf`, mode);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select className="h-10 w-auto" value={lang} onChange={(e) => setLang(e.target.value as "fr" | "ar")} aria-label={t("quotes.pdfLanguage")}>
        <option value="fr">PDF FR</option><option value="ar">PDF ع</option>
      </Select>
      <Button variant="outline" icon={<Eye className="h-4 w-4" />} loading={busy === "open"} onClick={() => run("open")}>{t("common.preview")}</Button>
      <Button variant="outline" icon={<Download className="h-4 w-4" />} loading={busy === "save"} onClick={() => run("save")}>{t("common.download")}</Button>
      <Button variant="outline" icon={<Printer className="h-4 w-4" />} loading={busy === "print"} onClick={() => run("print")}>{t("common.print")}</Button>
    </div>
  );
}

export function LinesTable({ items }: { items: Line[] }) {
  const { t, lang } = useI18n();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="bg-brand text-xs font-semibold text-white">
            {["#", t("lines.designation"), t("lines.quantity"), t("lines.unit"), t("lines.unitPrice"), t("lines.discount"), t("lines.tva"), t("lines.totalHt"), t("lines.totalTtc")].map((h, i) => (
              <th key={i} className={`px-3 py-2.5 ${i >= 2 ? "text-end" : "text-start"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((l, i) => (
            <tr key={l.id ?? i} className="odd:bg-white even:bg-surface/60">
              <td className="px-3 py-2.5 text-slate-400">{i + 1}</td>
              <td className="px-3 py-2.5">
                <div className="font-semibold text-navy">{l.designation}</div>
                <div className="text-xs text-slate-500">{t(`lines.${l.item_type}`)}{l.description ? ` — ${l.description}` : ""}</div>
              </td>
              <td className="px-3 py-2.5 text-end tabular-nums">{formatQty(l.quantity, lang)}</td>
              <td className="px-3 py-2.5 text-end">{t(`units.${l.unit}`)}</td>
              <td className="px-3 py-2.5 text-end tabular-nums">{formatMoney(l.unit_price_ht, lang)}</td>
              <td className="px-3 py-2.5 text-end tabular-nums">{toNumber(l.discount) ? formatMoney(l.discount, lang) : "—"}</td>
              <td className="px-3 py-2.5 text-end tabular-nums">{formatQty(l.tva_rate, lang)}</td>
              <td className="px-3 py-2.5 text-end tabular-nums">{formatMoney(l.total_ht, lang)}</td>
              <td className="px-3 py-2.5 text-end font-semibold tabular-nums">{formatMoney(l.total_ttc, lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TotalsBox({ rows }: { rows: { label: string; value: Money; strong?: boolean; highlight?: boolean; negative?: boolean }[] }) {
  const { lang } = useI18n();
  return (
    <dl className="ms-auto w-full max-w-sm space-y-1.5 text-sm">
      {rows.map((r) => (
        <div key={r.label} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-1.5 ${r.highlight ? "bg-accent font-extrabold text-navy" : r.strong ? "bg-surface font-bold text-navy" : "text-slate-600"}`}>
          <dt>{r.label}</dt><dd className="tabular-nums">{r.negative ? "- " : ""}{formatMoney(r.value, lang)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function InfoGrid({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {items.filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => (
        <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="font-medium text-navy">{v}</dd></div>
      ))}
    </dl>
  );
}
