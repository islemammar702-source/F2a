"use client";

import { useI18n } from "@/lib/i18n";
import { cx, Input } from "./ui";

export type PeriodValue = { period: string; date_from?: string; date_to?: string };

export default function PeriodFilter({ value, onChange }: { value: PeriodValue; onChange: (v: PeriodValue) => void }) {
  const { t } = useI18n();
  const opts = ["today", "week", "month", "year", "custom"];
  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
      <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-card ring-1 ring-slate-200/70">
        {opts.map((o) => (
          <button key={o} onClick={() => onChange({ ...value, period: o })} className={cx("whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition", value.period === o ? "bg-brand text-white" : "text-slate-500 hover:text-navy")}>
            {t(`common.${o}`)}
          </button>
        ))}
      </div>
      {value.period === "custom" && (
        <div className="flex items-center gap-2">
          <Input type="date" aria-label={t("common.from")} className="h-9 w-auto" value={value.date_from ?? ""} onChange={(e) => onChange({ ...value, date_from: e.target.value })} />
          <span className="text-slate-400">→</span>
          <Input type="date" aria-label={t("common.to")} className="h-9 w-auto" value={value.date_to ?? ""} onChange={(e) => onChange({ ...value, date_to: e.target.value })} />
        </div>
      )}
    </div>
  );
}

export function periodQuery(v: PeriodValue): Record<string, string | undefined> {
  if (v.period === "custom") {
    if (v.date_from && v.date_to) return { period: "custom", date_from: v.date_from, date_to: v.date_to };
    return { period: "year" };
  }
  return { period: v.period };
}
