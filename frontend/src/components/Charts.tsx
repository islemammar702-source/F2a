"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "@/lib/i18n";
import { formatCompact, formatMoney, formatMonth, toNumber } from "@/lib/format";
import type { Money } from "@/lib/types";

const BLUE = "#1A5DAB";
const ORANGE = "#F2711C";
const PALETTE = [BLUE, ORANGE, "#38B6F0", "#FDB022", "#2BA37A", "#7A8BA3", "#B44C4C", "#6C5BB4"];

type MonthRow = { month: string; invoiced: Money; collected: Money };

export function RevenueChart({ data, type = "bar" }: { data: MonthRow[]; type?: "bar" | "line" }) {
  const { t, lang, dir } = useI18n();
  const rows = data.map((d) => ({ name: formatMonth(d.month, lang), invoiced: toNumber(d.invoiced), collected: toNumber(d.collected) }));
  const rtl = dir === "rtl";
  const common = {
    data: rows,
    margin: { top: 8, right: 8, left: 8, bottom: 0 },
  };
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#E6ECF3" vertical={false} />
      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#5B6B80" }} reversed={rtl} axisLine={false} tickLine={false} />
      <YAxis tickFormatter={(v) => formatCompact(v, lang)} tick={{ fontSize: 11, fill: "#5B6B80" }} orientation={rtl ? "right" : "left"} axisLine={false} tickLine={false} width={48} />
      <Tooltip formatter={(v: number) => formatMoney(v, lang)} contentStyle={{ borderRadius: 12, borderColor: "#E6ECF3", fontSize: 12 }} />
      <Legend wrapperStyle={{ fontSize: 12 }} />
    </>
  );
  return (
    <div className="h-72 w-full" dir="ltr">
      <ResponsiveContainer>
        {type === "bar" ? (
          <BarChart {...common}>
            {axes}
            <Bar dataKey="invoiced" name={t("dashboard.invoiced")} fill={BLUE} radius={[6, 6, 0, 0]} maxBarSize={28} />
            <Bar dataKey="collected" name={t("dashboard.collected")} fill={ORANGE} radius={[6, 6, 0, 0]} maxBarSize={28} />
          </BarChart>
        ) : (
          <LineChart {...common}>
            {axes}
            <Line dataKey="invoiced" name={t("dashboard.invoiced")} stroke={BLUE} strokeWidth={2.5} dot={false} />
            <Line dataKey="collected" name={t("dashboard.collected")} stroke={ORANGE} strokeWidth={2.5} dot={false} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChart({ data }: { data: { name: string; value: number }[] }) {
  const { lang } = useI18n();
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="h-48 w-48 shrink-0" dir="ltr">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data.length ? data : [{ name: "-", value: 1 }]} dataKey="value" innerRadius={52} outerRadius={80} paddingAngle={data.length > 1 ? 3 : 0} stroke="none">
              {(data.length ? data : [{ name: "-", value: 1 }]).map((_, i) => <Cell key={i} fill={data.length ? PALETTE[i % PALETTE.length] : "#E6ECF3"} />)}
            </Pie>
            {data.length > 0 && <Tooltip formatter={(v: number) => formatMoney(v, lang)} />}
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full space-y-2 text-sm">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />{d.name}</span>
            <span className="font-semibold tabular-nums text-navy">{formatMoney(d.value, lang)} <span className="text-xs text-slate-400">({total ? Math.round((d.value / total) * 100) : 0}%)</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
