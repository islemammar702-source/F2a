"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CreditCard, Download, Paperclip, Plus, Search, Undo2 } from "lucide-react";
import { RequirePermission } from "@/components/AppShell";
import PaymentModal from "@/components/PaymentModal";
import { useToast } from "@/components/Toast";
import { Button, Card, ConfirmDialog, Empty, Field, Input, Loading, PageHeader, Pagination, Select, StatCard, StatusBadge, Table, Td, Textarea } from "@/components/ui";
import { api, downloadFile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useCompanySettings, useMethodLabel } from "@/lib/useSettings";
import type { Money, Page, Payment } from "@/lib/types";

export default function PaymentsPage() {
  return <RequirePermission perm="payments.view"><Payments /></RequirePermission>;
}

function Payments() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const settings = useCompanySettings();
  const methodLabel = useMethodLabel();
  const [q, setQ] = useState("");
  const [method, setMethod] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [cancel, setCancel] = useState<Payment | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const dq = useDebounced(q);
  const filters = { q: dq, method, status, date_from: from, date_to: to };
  const { data, loading, reload } = useApi<Page<Payment>>("/payments", { ...filters, page, page_size: 15 });
  const summary = useApi<{ total: Money; count: number; by_method: { method: string; count: number; amount: Money }[] }>("/payments/summary", { date_from: from, date_to: to });
  useEffect(() => setPage(1), [dq, method, status, from, to]);

  const doCancel = async () => {
    if (!cancel) return;
    setBusy(true);
    try {
      await api(`/payments/${cancel.id}/cancel`, { method: "POST", body: { reason } });
      toast.success(t("payments.cancelledOk"));
      setCancel(null);
      setReason("");
      reload();
      summary.reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={t("payments.title")} subtitle={t("payments.subtitle")}
        actions={can("payments.manage") && <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>{t("payments.new")}</Button>} />
      {summary.data && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard tone="green" label={t("payments.totalPeriod")} value={formatMoney(summary.data.total, lang)} hint={`${summary.data.count} ${t("common.results")}`} />
          {summary.data.by_method.map((m) => <StatCard key={m.method} label={methodLabel(m.method)} value={formatMoney(m.amount, lang)} hint={`${m.count}`} />)}
        </div>
      )}
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="ps-9" placeholder={t("common.search")} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select className="w-auto" value={method} onChange={(e) => setMethod(e.target.value)} aria-label={t("payments.method")}>
            <option value="">{t("payments.method")} : {t("common.all")}</option>
            {settings?.payment_methods.map((m) => <option key={m.code} value={m.code}>{lang === "ar" ? m.label_ar : m.label_fr}</option>)}
          </Select>
          <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t("common.status")}>
            <option value="">{t("common.status")} : {t("common.all")}</option>
            <option value="valid">{t("status.payment.valid")}</option><option value="cancelled">{t("status.payment.cancelled")}</option>
          </Select>
          <Input type="date" className="w-auto" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("common.from")} />
          <Input type="date" className="w-auto" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("common.to")} />
        </div>
        {loading && !data ? <Loading /> : data && data.items.length === 0 ? <Empty icon={<CreditCard className="h-10 w-10" />} /> : data && (
          <>
            <Table head={[t("payments.number"), t("common.date"), t("quotes.client"), t("payments.invoice"), t("payments.method"), t("common.reference"), t("common.amount"), t("common.status"), ""]}>
              {data.items.map((p) => (
                <tr key={p.id} className={p.status === "cancelled" ? "opacity-60" : ""}>
                  <Td className="font-semibold">{p.number}</Td>
                  <Td>{formatDate(p.payment_date, lang)}</Td>
                  <Td>{p.client.name}</Td>
                  <Td><Link href={`/invoices/${p.invoice.id}`} className="text-brand hover:underline">{p.invoice.number}</Link></Td>
                  <Td>{methodLabel(p.method)}</Td>
                  <Td dir="ltr">{p.reference ?? "—"}</Td>
                  <Td className={`font-semibold tabular-nums ${p.status === "cancelled" ? "line-through" : "text-emerald-700"}`}>{formatMoney(p.amount, lang)}</Td>
                  <Td><StatusBadge kind="payment" status={p.status} />{p.cancel_reason && <div className="mt-1 max-w-[180px] truncate text-xs text-red-600" title={p.cancel_reason}>{p.cancel_reason}</div>}</Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      {p.proof_document_id && <Button size="sm" variant="ghost" icon={<Paperclip className="h-4 w-4" />} aria-label={t("payments.proof")} onClick={() => downloadFile(`/documents/${p.proof_document_id}`, `justificatif-${p.number}`, "open").catch(toast.error)} />}
                      {p.status === "valid" && can("payments.manage") && <Button size="sm" variant="ghost" icon={<Undo2 className="h-4 w-4" />} onClick={() => setCancel(p)}>{t("payments.cancel")}</Button>}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
            <Pagination page={page} pageSize={15} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>
      <PaymentModal open={open} onClose={() => setOpen(false)} onSaved={() => { reload(); summary.reload(); }} />
      <ConfirmDialog open={!!cancel} onClose={() => setCancel(null)} onConfirm={doCancel} loading={busy} danger title={`${t("payments.cancel")} – ${cancel?.number ?? ""}`} text={t("payments.cancelText")}>
        <Field label={t("common.reason")} required className="mt-3"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </ConfirmDialog>
    </>
  );
}
