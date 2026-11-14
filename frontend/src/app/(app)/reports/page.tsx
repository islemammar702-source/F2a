"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, FileSpreadsheet, FileText, Info, TrendingUp, Wallet, WalletCards } from "lucide-react";
import { RequirePermission } from "@/components/AppShell";
import { DonutChart, RevenueChart } from "@/components/Charts";
import PeriodFilter, { periodQuery, type PeriodValue } from "@/components/PeriodFilter";
import { useToast } from "@/components/Toast";
import { Button, Card, Empty, Loading, PageHeader, StatCard, StatusBadge, Table, Td } from "@/components/ui";
import { downloadFile } from "@/lib/api";
import { formatDate, formatMoney, formatMonth, toNumber } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useMethodLabel } from "@/lib/useSettings";
import type { Money } from "@/lib/types";

type Report = {
  date_from: string; date_to: string;
  summary: { invoiced: Money; invoice_count: number; collected: Money; payment_count: number; outstanding: Money; open_invoice_count: number; overdue: Money; overdue_count: number };
  by_month: { month: string; invoiced: Money; collected: Money }[];
  by_client: { client_id: string; name: string; invoiced: Money; collected: Money; balance: Money }[];
  by_method: { method: string; count: number; amount: Money }[];
  unpaid: { id: string; number: string; client: string; client_id: string; issue_date: string; due_date: string; status: string; total_due: Money; amount_paid: Money; balance: Money; days_late: number }[];
};

export default function ReportsPage() {
  return <RequirePermission perm="reports.view"><Reports /></RequirePermission>;
}

function Reports() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const methodLabel = useMethodLabel();
  const [period, setPeriod] = useState<PeriodValue>({ period: "year" });
  const query = periodQuery(period);
  const { data, loading } = useApi<Report>("/reports", query);
  const [busy, setBusy] = useState<string | null>(null);

  const exp = async (format: "pdf" | "xlsx") => {
    setBusy(format);
    const qs = new URLSearchParams({ format, lang, ...Object.fromEntries(Object.entries(query).filter(([, v]) => v)) as Record<string, string> });
    try {
      await downloadFile(`/reports/export?${qs}`, `rapport-f2a.${format}`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };

  const s = data?.summary;
  return (
    <>
      <PageHeader title={t("reports.title")} subtitle={t("reports.subtitle")} actions={<>
        <Button variant="outline" icon={<FileText className="h-4 w-4" />} loading={busy === "pdf"} onClick={() => exp("pdf")}>{t("reports.exportPdf")}</Button>
        <Button variant="outline" icon={<FileSpreadsheet className="h-4 w-4" />} loading={busy === "xlsx"} onClick={() => exp("xlsx")}>{t("reports.exportExcel")}</Button>
      </>} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <PeriodFilter value={period} onChange={setPeriod} />
        {data && <span className="text-sm text-slate-500">{formatDate(data.date_from, lang)} → {formatDate(data.date_to, lang)}</span>}
      </div>
      {loading && !data ? <Loading /> : data && s && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard tone="navy" icon={<TrendingUp className="h-5 w-5" />} label={t("reports.invoiced")} value={formatMoney(s.invoiced, lang)} hint={`${t("reports.invoicedHint")} · ${s.invoice_count}`} />
            <StatCard tone="green" icon={<Wallet className="h-5 w-5" />} label={t("reports.collected")} value={formatMoney(s.collected, lang)} hint={`${t("reports.collectedHint")} · ${s.payment_count}`} />
            <StatCard tone="orange" icon={<WalletCards className="h-5 w-5" />} label={t("reports.outstanding")} value={formatMoney(s.outstanding, lang)} hint={`${t("reports.overdue")} : ${formatMoney(s.overdue, lang)} (${s.overdue_count})`} />
          </div>
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand"><Info className="mt-0.5 h-4 w-4 shrink-0" />{t("reports.note")}</p>

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <Card title={t("reports.evolution")} className="xl:col-span-2"><RevenueChart data={data.by_month} type={data.by_month.length > 12 ? "line" : "bar"} /></Card>
            <Card title={t("reports.byMethod")}>
              {data.by_method.length ? <DonutChart data={data.by_method.map((m) => ({ name: methodLabel(m.method), value: toNumber(m.amount) }))} /> : <Empty />}
            </Card>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card padded={false} title={t("reports.byMonth")}>
              <Table head={[t("reports.month"), t("dashboard.invoiced"), t("dashboard.collected")]}>
                {data.by_month.map((m) => (
                  <tr key={m.month}><Td>{formatMonth(m.month, lang)}</Td><Td className="tabular-nums">{formatMoney(m.invoiced, lang)}</Td><Td className="tabular-nums text-emerald-700">{formatMoney(m.collected, lang)}</Td></tr>
                ))}
              </Table>
            </Card>
            <Card padded={false} title={t("reports.byClient")}>
              {data.by_client.length === 0 ? <Empty /> : (
                <Table head={[t("quotes.client"), t("dashboard.invoiced"), t("dashboard.collected"), t("clients.balance")]}>
                  {data.by_client.map((c) => (
                    <tr key={c.client_id}>
                      <Td><Link href={`/clients/${c.client_id}`} className="font-semibold text-brand hover:underline">{c.name}</Link></Td>
                      <Td className="tabular-nums">{formatMoney(c.invoiced, lang)}</Td><Td className="tabular-nums">{formatMoney(c.collected, lang)}</Td>
                      <Td className="tabular-nums font-semibold">{formatMoney(c.balance, lang)}</Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
          </div>

          <Card className="mt-6" padded={false} title={<span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-accent" />{t("reports.unpaid")} ({data.unpaid.length})</span>}>
            {data.unpaid.length === 0 ? <Empty /> : (
              <Table head={[t("invoices.number"), t("quotes.client"), t("invoices.dueDate"), t("invoices.totalDue"), t("invoices.paid"), t("invoices.balance"), t("reports.daysLate"), t("common.status")]}>
                {data.unpaid.map((i) => (
                  <tr key={i.id}>
                    <Td><Link href={`/invoices/${i.id}`} className="font-semibold text-brand hover:underline">{i.number}</Link></Td>
                    <Td>{i.client}</Td><Td>{formatDate(i.due_date, lang)}</Td>
                    <Td className="tabular-nums">{formatMoney(i.total_due, lang)}</Td><Td className="tabular-nums">{formatMoney(i.amount_paid, lang)}</Td>
                    <Td className="tabular-nums font-semibold">{formatMoney(i.balance, lang)}</Td>
                    <Td className={i.days_late ? "font-semibold text-red-600" : ""}>{i.days_late || "—"}</Td>
                    <Td><StatusBadge kind="invoice" status={i.status} /></Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </>
      )}
    </>
  );
}
