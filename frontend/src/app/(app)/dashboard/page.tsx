"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, FilePlus2, FileSignature, FileText, Hourglass, Receipt, UserPlus, Users, Wallet, WalletCards, XCircle } from "lucide-react";
import { RequirePermission } from "@/components/AppShell";
import ActivityRow from "@/components/ActivityRow";
import { DonutChart, RevenueChart } from "@/components/Charts";
import PeriodFilter, { periodQuery, type PeriodValue } from "@/components/PeriodFilter";
import { Button, Card, Empty, Loading, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatDate, formatMoney, toNumber } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useMethodLabel } from "@/lib/useSettings";
import type { Activity, InvoiceListItem, Money, Payment, QuoteListItem } from "@/lib/types";

type Dashboard = {
  stats: Record<string, number> & { total_invoiced: Money; total_collected: Money; total_outstanding: Money };
  monthly: { month: string; invoiced: Money; collected: Money }[];
  payments_by_method: { method: string; count: number; amount: Money }[];
  recent_quotes?: QuoteListItem[];
  recent_invoices?: InvoiceListItem[];
  recent_payments?: Payment[];
  activity?: Activity[];
};

export default function DashboardPage() {
  return <RequirePermission perm="dashboard.view"><DashboardContent /></RequirePermission>;
}

function DashboardContent() {
  const { t, lang } = useI18n();
  const { user, can } = useAuth();
  const methodLabel = useMethodLabel();
  const [period, setPeriod] = useState<PeriodValue>({ period: "year" });
  const { data, loading } = useApi<Dashboard>("/dashboard", periodQuery(period));
  const s = data?.stats;
  const i = "h-5 w-5";

  return (
    <>
      <PageHeader
        title={`${t("auth.welcome")}, ${user?.full_name.split(" ")[0] ?? ""}`}
        subtitle={t("dashboard.subtitle")}
        actions={<>
          {can("clients.manage") && <Link href="/clients?new=1"><Button variant="outline" icon={<UserPlus className="h-4 w-4" />}>{t("dashboard.newClient")}</Button></Link>}
          {can("invoices.manage") && <Link href="/invoices/new"><Button variant="secondary" icon={<Receipt className="h-4 w-4" />}>{t("dashboard.newInvoice")}</Button></Link>}
          {can("quotes.manage") && <Link href="/quotes/new"><Button variant="accent" icon={<FilePlus2 className="h-4 w-4" />}>{t("quotes.new")}</Button></Link>}
        </>}
      />
      <div className="mb-5"><PeriodFilter value={period} onChange={setPeriod} /></div>

      {loading && !data ? <Loading /> : s && data && (
        <>
          {s.invoices_overdue > 0 && can("invoices.view") && (
            <Link href="/invoices?status=overdue" className="mb-5 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100">
              <AlertTriangle className="h-5 w-5" /> {t("dashboard.overdueAlert", { count: s.invoices_overdue })}
            </Link>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard tone="navy" icon={<FileText className={i} />} label={t("dashboard.totalInvoiced")} value={formatMoney(s.total_invoiced, lang)} />
            <StatCard tone="green" icon={<Wallet className={i} />} label={t("dashboard.totalCollected")} value={formatMoney(s.total_collected, lang)} />
            <StatCard tone="orange" icon={<WalletCards className={i} />} label={t("dashboard.totalOutstanding")} value={formatMoney(s.total_outstanding, lang)} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard icon={<Users className={i} />} label={t("dashboard.clients")} value={s.clients} />
            <StatCard icon={<FileSignature className={i} />} label={t("dashboard.quotes")} value={s.quotes} />
            <StatCard tone="orange" icon={<Hourglass className={i} />} label={t("dashboard.quotesPending")} value={s.quotes_pending} />
            <StatCard tone="green" icon={<CheckCircle2 className={i} />} label={t("dashboard.quotesAccepted")} value={s.quotes_accepted} />
            <StatCard icon={<Receipt className={i} />} label={t("dashboard.invoices")} value={s.invoices} />
            <StatCard tone="green" icon={<CheckCircle2 className={i} />} label={t("dashboard.invoicesPaid")} value={s.invoices_paid} />
            <StatCard tone="orange" icon={<Clock className={i} />} label={t("dashboard.invoicesPartial")} value={s.invoices_partial} />
            <StatCard tone="red" icon={<XCircle className={i} />} label={t("dashboard.invoicesUnpaid")} value={s.invoices_unpaid} />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <Card title={t("dashboard.monthlyRevenue")} className="xl:col-span-2"><RevenueChart data={data.monthly} /></Card>
            <Card title={t("dashboard.paymentsChart")}>
              {data.payments_by_method.length ? (
                <DonutChart data={data.payments_by_method.map((m) => ({ name: methodLabel(m.method), value: toNumber(m.amount) }))} />
              ) : <Empty />}
            </Card>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {data.recent_quotes && (
              <Card title={t("dashboard.latestQuotes")} padded={false} actions={<Link href="/quotes" className="text-xs font-semibold text-brand hover:underline">{t("common.seeAll")}</Link>}>
                {data.recent_quotes.length === 0 ? <Empty /> : (
                  <ul className="divide-y divide-slate-100">
                    {data.recent_quotes.map((q) => (
                      <li key={q.id}><Link href={`/quotes/${q.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface">
                        <span className="min-w-0"><span className="block font-semibold text-navy">{q.number}</span><span className="block truncate text-xs text-slate-500">{q.client.name} · {formatDate(q.issue_date, lang)}</span></span>
                        <span className="flex shrink-0 flex-col items-end gap-1"><span className="text-sm font-semibold tabular-nums">{formatMoney(q.total_ttc, lang)}</span><StatusBadge kind="quote" status={q.status} /></span>
                      </Link></li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
            {data.recent_invoices && (
              <Card title={t("dashboard.latestInvoices")} padded={false} actions={<Link href="/invoices" className="text-xs font-semibold text-brand hover:underline">{t("common.seeAll")}</Link>}>
                {data.recent_invoices.length === 0 ? <Empty /> : (
                  <ul className="divide-y divide-slate-100">
                    {data.recent_invoices.map((v) => (
                      <li key={v.id}><Link href={`/invoices/${v.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface">
                        <span className="min-w-0"><span className="block font-semibold text-navy">{v.number}</span><span className="block truncate text-xs text-slate-500">{v.client.name} · {formatDate(v.due_date, lang)}</span></span>
                        <span className="flex shrink-0 flex-col items-end gap-1"><span className="text-sm font-semibold tabular-nums">{formatMoney(v.total_due, lang)}</span><StatusBadge kind="invoice" status={v.status} /></span>
                      </Link></li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
            {data.recent_payments && (
              <Card title={t("dashboard.latestPayments")} padded={false} actions={<Link href="/payments" className="text-xs font-semibold text-brand hover:underline">{t("common.seeAll")}</Link>}>
                {data.recent_payments.length === 0 ? <Empty /> : (
                  <ul className="divide-y divide-slate-100">
                    {data.recent_payments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <span className="min-w-0"><span className="block font-semibold text-navy">{p.client.name}</span><span className="block truncate text-xs text-slate-500">{p.invoice.number} · {methodLabel(p.method)} · {formatDate(p.payment_date, lang)}</span></span>
                        <span className="flex shrink-0 flex-col items-end gap-1"><span className="text-sm font-semibold tabular-nums text-emerald-700">+ {formatMoney(p.amount, lang)}</span><StatusBadge kind="payment" status={p.status} /></span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
            {data.activity && (
              <Card title={t("common.activity")} padded={false}>
                {data.activity.length === 0 ? <Empty /> : (
                  <ul className="divide-y divide-slate-100">
                    {data.activity.map((a) => <ActivityRow key={a.id} a={a} />)}
                  </ul>
                )}
              </Card>
            )}
          </div>
        </>
      )}
    </>
  );
}
