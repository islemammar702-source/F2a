"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Ban, Mail, MessageCircle, Pencil, Plus, Send, Undo2 } from "lucide-react";
import { RequirePermission } from "@/components/AppShell";
import ActivityRow from "@/components/ActivityRow";
import DocumentEditor, { toPayloadItems, type EditorValue } from "@/components/DocumentEditor";
import Attachments from "@/components/Attachments";
import { InfoGrid, LinesTable, PdfActions, TotalsBox } from "@/components/DocView";
import PaymentModal from "@/components/PaymentModal";
import { useToast } from "@/components/Toast";
import { Button, Card, ConfirmDialog, Empty, Field, Input, Loading, Modal, PageHeader, StatusBadge, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatMoney, toNumber, waLink } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useCompanySettings, useMethodLabel } from "@/lib/useSettings";
import type { Activity, Invoice, PaymentBrief } from "@/lib/types";

export default function InvoiceDetailPage() {
  return <RequirePermission perm="invoices.view"><InvoiceDetail /></RequirePermission>;
}

function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const settings = useCompanySettings();
  const methodLabel = useMethodLabel();
  const { data: inv, loading, setData, reload } = useApi<Invoice>(`/invoices/${id}`);
  const history = useApi<Activity[]>(`/invoices/${id}/history`);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelPayment, setCancelPayment] = useState<PaymentBrief | null>(null);
  const [reason, setReason] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading && !inv) return <Loading />;
  if (!inv) return <Empty text={t("common.notFound")} />;
  const refresh = () => { reload(); history.reload(); };
  const cancelled = inv.status === "cancelled";
  const pct = toNumber(inv.total_due) ? Math.min(100, Math.round((toNumber(inv.amount_paid) / toNumber(inv.total_due)) * 100)) : 0;

  const save = async (v: EditorValue) => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { title: v.title, site_address: v.site_address || null, due_date: v.second_date, payment_terms: v.payment_terms || null, notes: v.notes || null, language: v.language };
      if (inv.editable_items) Object.assign(body, { client_id: v.client_id, issue_date: v.issue_date, apply_stamp_duty: v.apply_stamp_duty, items: toPayloadItems(v.items) });
      setData(await api<Invoice>(`/invoices/${inv.id}`, { method: "PATCH", body }));
      toast.success(t("invoices.updated"));
      setEditing(false);
      history.reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  const doCancel = async () => {
    setBusy(true);
    try {
      setData(await api<Invoice>(`/invoices/${inv.id}/cancel`, { method: "POST", body: { reason } }));
      toast.success(t("invoices.cancelled"));
      setCancelOpen(false);
      setReason("");
      history.reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const doCancelPayment = async () => {
    if (!cancelPayment) return;
    setBusy(true);
    try {
      await api(`/payments/${cancelPayment.id}/cancel`, { method: "POST", body: { reason } });
      toast.success(t("payments.cancelledOk"));
      setCancelPayment(null);
      setReason("");
      refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const company = settings?.name ?? "F2A TRAVAUX";
  const msg = t("invoices.whatsappMessage", { number: inv.number, company, amount: formatMoney(inv.total_due, lang), balance: formatMoney(inv.balance, lang), date: formatDate(inv.due_date, lang) });
  const send = async (channel: "email" | "whatsapp") => {
    setBusy(true);
    try {
      if (channel === "whatsapp") window.open(waLink(inv.client.whatsapp || inv.client.phone, msg), "_blank", "noopener");
      const r = await api<{ delivered: boolean }>(`/invoices/${inv.id}/send`, { method: "POST", body: { channel, email: email || null, lang: inv.language } });
      if (channel === "email" && !r.delivered) {
        toast.success(t("quotes.emailNotConfigured"));
        window.location.href = `mailto:${email}?subject=${encodeURIComponent(`${company} – ${inv.number}`)}&body=${encodeURIComponent(msg)}`;
      } else toast.success(t("invoices.sent"));
      setSendOpen(false);
      history.reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const initial: Partial<EditorValue> = {
    client_id: inv.client.id, title: inv.title, site_address: inv.site_address ?? "", issue_date: inv.issue_date, second_date: inv.due_date,
    payment_terms: inv.payment_terms ?? "", notes: inv.notes ?? "", language: inv.language, apply_stamp_duty: toNumber(inv.stamp_duty) > 0,
    items: inv.items.map((l) => ({ ...l, quantity: String(toNumber(l.quantity)), unit_price_ht: String(toNumber(l.unit_price_ht)), discount: String(toNumber(l.discount)), tva_rate: String(toNumber(l.tva_rate)) })),
  };

  return (
    <>
      <PageHeader
        back={<Link href="/invoices" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{t("invoices.title")}</Link>}
        title={<span className="flex flex-wrap items-center gap-3">{editing ? t("invoices.editTitle") : `${t("nav.invoices")} ${inv.number}`} <StatusBadge kind="invoice" status={inv.status} /></span>}
        subtitle={`${inv.client.name} · ${inv.title}`}
        actions={!editing && <PdfActions path={`/invoices/${inv.id}/pdf`} filename={inv.number} defaultLang={inv.language} />}
      />
      {cancelled && <div className="mb-5 rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700">{t("invoices.cancelledOn", { date: formatDate(inv.cancelled_at, lang), reason: inv.cancel_reason ?? "" })}</div>}

      {editing ? (
        <DocumentEditor kind="invoice" initial={initial} onSubmit={save} saving={saving} lockClientAndItems={!inv.editable_items} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Card title={t("common.details")}>
              <InfoGrid items={[
                [t("quotes.client"), <Link key="c" href={`/clients/${inv.client.id}`} className="text-brand hover:underline">{inv.client.name}</Link>],
                [t("invoices.issueDate"), formatDate(inv.issue_date, lang)],
                [t("invoices.dueDate"), formatDate(inv.due_date, lang)],
                [t("invoices.quoteRef"), inv.quote && <Link key="q" href={`/quotes/${inv.quote.id}`} className="text-brand hover:underline">{inv.quote.number}</Link>],
                [t("quotes.siteAddress"), inv.site_address],
              ]} />
            </Card>
            <Card padded={false} title={t("quotes.step3")}>
              <LinesTable items={inv.items} />
              <div className="p-5">
                <TotalsBox rows={[
                  { label: t("lines.subtotal"), value: inv.subtotal_ht },
                  ...(toNumber(inv.total_discount) ? [{ label: t("lines.totalDiscount"), value: inv.total_discount, negative: true }] : []),
                  { label: t("lines.netHt"), value: inv.total_ht, strong: true },
                  { label: t("lines.totalTva"), value: inv.total_tva },
                  { label: t("lines.grandTotal"), value: inv.total_ttc, strong: true },
                  ...(toNumber(inv.stamp_duty) ? [{ label: t("lines.stamp"), value: inv.stamp_duty }, { label: t("lines.netToPay"), value: inv.total_due, strong: true }] : []),
                  { label: t("invoices.paid"), value: inv.amount_paid },
                  { label: t("invoices.balance"), value: inv.balance, highlight: true },
                ]} />
              </div>
            </Card>
            <Card padded={false} title={t("invoices.paymentsTitle")} actions={can("payments.manage") && !cancelled && toNumber(inv.balance) > 0 && (
              <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setPayOpen(true)}>{t("invoices.addPayment")}</Button>
            )}>
              {inv.payments.length === 0 ? <Empty text={t("invoices.noPayments")} /> : (
                <ul className="divide-y divide-slate-100">
                  {inv.payments.map((p) => (
                    <li key={p.id} className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm ${p.status === "cancelled" ? "opacity-60" : ""}`}>
                      <div>
                        <div className="font-semibold text-navy"><span className="ltr-nums">{p.number}</span> · <span className="ltr-nums">{formatDate(p.payment_date, lang)}</span></div>
                        <div className="text-xs text-slate-500">{methodLabel(p.method)}{p.reference ? ` · ${p.reference}` : ""}{p.comment ? ` · ${p.comment}` : ""}</div>
                        {p.cancel_reason && <div className="text-xs text-red-600">{t("common.reason")} : {p.cancel_reason}</div>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`font-bold tabular-nums ${p.status === "cancelled" ? "line-through" : "text-emerald-700"}`}>{formatMoney(p.amount, lang)}</span>
                        <StatusBadge kind="payment" status={p.status} />
                        {p.status === "valid" && can("payments.manage") && (
                          <Button size="sm" variant="ghost" icon={<Undo2 className="h-4 w-4" />} onClick={() => setCancelPayment(p)}>{t("payments.cancel")}</Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
          <div className="space-y-6">
            <Card title={t("invoices.progress")}>
              <div className="mb-2 flex justify-between text-sm"><span>{formatMoney(inv.amount_paid, lang)}</span><b>{pct}%</b></div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-brand to-accent transition-all" style={{ width: `${pct}%` }} /></div>
              <p className="mt-3 text-sm text-slate-600">{t("invoices.balance")} : <b className="tabular-nums text-navy">{formatMoney(inv.balance, lang)}</b></p>
            </Card>
            <Attachments entityType="invoice" entityId={inv.id} canManage={can("invoices.manage")} />
            {can("invoices.manage") && !cancelled && (
              <Card title={t("common.actions")}>
                <div className="flex flex-col gap-2">
                  <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>{t("common.edit")}</Button>
                  <Button icon={<Send className="h-4 w-4" />} onClick={() => { setEmail(inv.client.email ?? ""); setSendOpen(true); }}>{t("common.send")}</Button>
                  {inv.editable_items && <Button variant="ghost" className="text-red-600" icon={<Ban className="h-4 w-4" />} onClick={() => setCancelOpen(true)}>{t("invoices.cancel")}</Button>}
                </div>
                {!inv.editable_items && <p className="mt-3 text-xs text-slate-500">{t("invoices.restrictedEdit")}</p>}
              </Card>
            )}
            <Card padded={false} title={t("invoices.history")}>
              {history.data?.length ? <ul className="divide-y divide-slate-100">{history.data.map((a) => <ActivityRow key={a.id} a={a} />)}</ul> : <Empty />}
            </Card>
          </div>
        </div>
      )}

      <PaymentModal open={payOpen} onClose={() => setPayOpen(false)} invoice={inv} onSaved={refresh} />
      <ConfirmDialog open={cancelOpen} onClose={() => setCancelOpen(false)} onConfirm={doCancel} loading={busy} danger title={t("invoices.cancel")} text={t("invoices.cancelText")}>
        <Field label={t("common.reason")} required className="mt-3"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </ConfirmDialog>
      <ConfirmDialog open={!!cancelPayment} onClose={() => setCancelPayment(null)} onConfirm={doCancelPayment} loading={busy} danger title={`${t("payments.cancel")} – ${cancelPayment?.number ?? ""}`} text={t("payments.cancelText")}>
        <Field label={t("common.reason")} required className="mt-3"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </ConfirmDialog>
      <Modal open={sendOpen} onClose={() => setSendOpen(false)} title={t("common.send")}>
        <div className="space-y-4">
          <Field label={t("common.email")}><Input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Button className="w-full" icon={<Mail className="h-4 w-4" />} disabled={!email} loading={busy} onClick={() => send("email")}>{t("quotes.sendEmail")}</Button>
          <Button className="w-full bg-emerald-600 hover:bg-emerald-700" icon={<MessageCircle className="h-4 w-4" />} disabled={!inv.client.whatsapp && !inv.client.phone} onClick={() => send("whatsapp")}>{t("quotes.shareWhatsapp")}</Button>
        </div>
      </Modal>
    </>
  );
}
