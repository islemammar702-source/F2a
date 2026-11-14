"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { LinesTable, PdfActions, TotalsBox } from "@/components/DocView";
import { Card, Empty, Loading, PageHeader, StatusBadge } from "@/components/ui";
import { formatDate, formatMoney, toNumber } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useMethodLabel } from "@/lib/useSettings";
import type { Invoice, InvoiceListItem } from "@/lib/types";

export default function PortalInvoices() {
  const { t, lang } = useI18n();
  const { data, loading } = useApi<InvoiceListItem[]>("/portal/invoices");
  const [open, setOpen] = useState<string | null>(null);
  if (loading && !data) return <Loading />;
  return (
    <>
      <PageHeader title={t("nav.myInvoices")} />
      {!data?.length ? <Card><Empty text={t("portal.noInvoices")} /></Card> : (
        <div className="space-y-3">
          {data.map((v) => (
            <Card key={v.id} padded={false}>
              <button onClick={() => setOpen(open === v.id ? null : v.id)} className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-start">
                <span><span className="block font-bold text-navy">{v.number} · {v.title}</span><span className="text-xs text-slate-500">{formatDate(v.issue_date, lang)} · {t("invoices.dueDate")} {formatDate(v.due_date, lang)}</span></span>
                <span className="flex items-center gap-3">
                  <span className="text-end text-sm"><b className="block tabular-nums">{formatMoney(v.total_due, lang)}</b>{toNumber(v.balance) > 0 && <span className="text-xs text-red-600">{t("invoices.balance")} : {formatMoney(v.balance, lang)}</span>}</span>
                  <StatusBadge kind="invoice" status={v.status} /><ChevronDown className={`h-4 w-4 transition ${open === v.id ? "rotate-180" : ""}`} />
                </span>
              </button>
              {open === v.id && <InvoiceBody id={v.id} />}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function InvoiceBody({ id }: { id: string }) {
  const { t, lang } = useI18n();
  const methodLabel = useMethodLabel();
  const { data: inv } = useApi<Invoice>(`/portal/invoices/${id}`);
  if (!inv) return <Loading />;
  const valid = inv.payments.filter((p) => p.status === "valid");
  return (
    <div className="border-t border-slate-100">
      <LinesTable items={inv.items} />
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <PdfActions path={`/portal/invoices/${inv.id}/pdf`} filename={inv.number} defaultLang={inv.language} />
          {valid.length > 0 && (
            <ul className="space-y-1 text-sm">
              <li className="font-semibold text-navy">{t("invoices.paymentsTitle")}</li>
              {valid.map((p) => <li key={p.id} className="text-slate-600">{formatDate(p.payment_date, lang)} · {methodLabel(p.method)} · <b className="tabular-nums text-emerald-700">{formatMoney(p.amount, lang)}</b></li>)}
            </ul>
          )}
        </div>
        <TotalsBox rows={[
          { label: t("lines.netHt"), value: inv.total_ht },
          { label: t("lines.totalTva"), value: inv.total_tva },
          ...(toNumber(inv.stamp_duty) ? [{ label: t("lines.stamp"), value: inv.stamp_duty }] : []),
          { label: t("lines.netToPay"), value: inv.total_due, strong: true },
          { label: t("invoices.paid"), value: inv.amount_paid },
          { label: t("invoices.balance"), value: inv.balance, highlight: true },
        ]} />
      </div>
    </div>
  );
}
