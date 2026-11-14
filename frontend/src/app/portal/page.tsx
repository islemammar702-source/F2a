"use client";

import Link from "next/link";
import { useState } from "react";
import { FileSignature, Plus, Receipt, Wallet, WalletCards } from "lucide-react";
import RequestForm from "@/components/RequestForm";
import { Badge, Button, Card, Empty, Loading, Modal, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useCompanySettings } from "@/lib/useSettings";
import type { Client, Money, QuoteRequest } from "@/lib/types";

type Summary = { client: Client; totals: { invoiced: Money; paid: Money; balance: Money }; pending_quotes: number; open_invoices: number };

export default function PortalHome() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const settings = useCompanySettings();
  const { data } = useApi<Summary>("/portal/summary");
  const requests = useApi<QuoteRequest[]>("/portal/requests");
  const [open, setOpen] = useState(false);
  if (!data) return <Loading />;

  return (
    <>
      <PageHeader title={t("portal.welcome", { name: user?.full_name.split(" ")[0] ?? "" })} subtitle={t("portal.subtitle")}
        actions={<Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>{t("portal.newRequest")}</Button>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Link href="/portal/quotes"><StatCard tone="orange" icon={<FileSignature className="h-5 w-5" />} label={t("portal.pendingQuotes")} value={data.pending_quotes} /></Link>
        <Link href="/portal/invoices"><StatCard tone="red" icon={<Receipt className="h-5 w-5" />} label={t("portal.openInvoices")} value={data.open_invoices} /></Link>
        <StatCard tone="navy" label={t("portal.totalInvoiced")} value={formatMoney(data.totals.invoiced, lang)} />
        <StatCard tone="green" icon={<Wallet className="h-5 w-5" />} label={t("portal.totalPaid")} value={formatMoney(data.totals.paid, lang)} />
        <StatCard tone="orange" icon={<WalletCards className="h-5 w-5" />} label={t("portal.balance")} value={formatMoney(data.totals.balance, lang)} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title={t("portal.myRequests")} className="lg:col-span-2" padded={false}>
          {!requests.data?.length ? <Empty text={t("portal.noRequests")} /> : (
            <ul className="divide-y divide-slate-100">
              {requests.data.map((r) => (
                <li key={r.id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2"><Badge color="blue">{t(`services.${r.service}`)}</Badge><span className="text-xs text-slate-500">{formatDateTime(r.created_at, lang)}</span></span>
                    <StatusBadge kind="request" status={r.status} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-slate-600">{r.message}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={t("portal.contactUs")}>
          <ul className="space-y-2 text-sm">
            <li className="font-semibold text-navy">{settings?.name}</li>
            {settings?.phone && <li><a dir="ltr" href={`tel:${settings.phone}`} className="text-brand">{settings.phone}</a></li>}
            {settings?.email && <li><a href={`mailto:${settings.email}`} className="text-brand">{settings.email}</a></li>}
            {settings?.address && <li className="text-slate-600">{settings.address}{settings.city ? `, ${settings.city}` : ""}</li>}
          </ul>
        </Card>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={t("portal.newRequest")} size="lg">
        <RequestForm endpoint="/portal/requests" defaults={{ name: data.client.name, phone: data.client.phone ?? "", email: user?.email }} onDone={() => requests.reload()} />
      </Modal>
    </>
  );
}
