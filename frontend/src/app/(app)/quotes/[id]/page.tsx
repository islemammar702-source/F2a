"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, Copy, FileText, Mail, MessageCircle, Pencil, RotateCcw, Send, XCircle } from "lucide-react";
import { RequirePermission } from "@/components/AppShell";
import DocumentEditor, { toPayloadItems, type EditorValue } from "@/components/DocumentEditor";
import { InfoGrid, LinesTable, PdfActions, TotalsBox } from "@/components/DocView";
import { useToast } from "@/components/Toast";
import { Button, Card, Checkbox, ConfirmDialog, Empty, Field, Input, Loading, Modal, PageHeader, StatusBadge, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatDateTime, formatMoney, toNumber, waLink } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useCompanySettings } from "@/lib/useSettings";
import type { Invoice, Quote } from "@/lib/types";

export default function QuoteDetailPage() {
  return <RequirePermission perm="quotes.view"><QuoteDetail /></RequirePermission>;
}

function QuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const settings = useCompanySettings();
  const { data: q, loading, setData, reload } = useApi<Quote>(`/quotes/${id}`);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [decision, setDecision] = useState<"accepted" | "refused" | null>(null);
  const [comment, setComment] = useState("");
  const [stamp, setStamp] = useState(true);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading && !q) return <Loading />;
  if (!q) return <Empty text={t("common.notFound")} />;
  const manage = can("quotes.manage");

  const changeStatus = async (status: string, cmt?: string) => {
    setBusy(true);
    try {
      setData(await api<Quote>(`/quotes/${q.id}/status`, { method: "POST", body: { status, comment: cmt || null } }));
      toast.success(t("quotes.statusChanged"));
      setDecision(null);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const save = async (v: EditorValue) => {
    setSaving(true);
    try {
      setData(await api<Quote>(`/quotes/${q.id}`, {
        method: "PUT",
        body: {
          client_id: v.client_id, request_id: q.request_id, title: v.title, site_address: v.site_address || null, issue_date: v.issue_date,
          validity_date: v.second_date, payment_terms: v.payment_terms || null, special_conditions: v.special_conditions || null,
          notes: v.notes || null, language: v.language, items: toPayloadItems(v.items),
        },
      }));
      toast.success(t("quotes.updated"));
      setEditing(false);
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    try {
      const d = await api<Quote>(`/quotes/${q.id}/duplicate`, { method: "POST" });
      toast.success(`${t("quotes.duplicated")} – ${d.number}`);
      router.push(`/quotes/${d.id}`);
    } catch (e) {
      toast.error(e);
    }
  };

  const convert = async () => {
    setBusy(true);
    try {
      const inv = await api<Invoice>(`/invoices/from-quote/${q.id}`, { method: "POST", body: { apply_stamp_duty: stamp } });
      toast.success(`${t("invoices.created")} – ${inv.number}`);
      router.push(`/invoices/${inv.id}`);
    } catch (e) {
      toast.error(e);
      setBusy(false);
    }
  };

  const company = settings?.name ?? "F2A TRAVAUX";
  const waText = t("quotes.whatsappMessage", { number: q.number, company, amount: formatMoney(q.total_ttc, lang), date: formatDate(q.validity_date, lang) });

  const sendEmail = async () => {
    setBusy(true);
    try {
      const r = await api<{ delivered: boolean; smtp_configured: boolean }>(`/quotes/${q.id}/send`, { method: "POST", body: { channel: "email", email: email || null, lang: q.language } });
      if (r.delivered) toast.success(t("quotes.emailSentOk"));
      else {
        toast.success(t("quotes.emailNotConfigured"));
        window.location.href = `mailto:${email || q.client.email || ""}?subject=${encodeURIComponent(`${company} – ${q.number}`)}&body=${encodeURIComponent(waText)}`;
      }
      setSendOpen(false);
      reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const shareWhatsapp = async () => {
    window.open(waLink(q.client.whatsapp || q.client.phone, waText), "_blank", "noopener");
    try {
      await api(`/quotes/${q.id}/send`, { method: "POST", body: { channel: "whatsapp", lang: q.language } });
      reload();
    } catch { /* ignore */ }
    setSendOpen(false);
  };

  const initial: Partial<EditorValue> = {
    client_id: q.client.id, title: q.title, site_address: q.site_address ?? "", issue_date: q.issue_date, second_date: q.validity_date,
    payment_terms: q.payment_terms ?? "", special_conditions: q.special_conditions ?? "", notes: q.notes ?? "", language: q.language,
    items: q.items.map((l) => ({ ...l, quantity: String(toNumber(l.quantity)), unit_price_ht: String(toNumber(l.unit_price_ht)), discount: String(toNumber(l.discount)), tva_rate: String(toNumber(l.tva_rate)) })),
  };

  return (
    <>
      <PageHeader
        back={<Link href="/quotes" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{t("quotes.title")}</Link>}
        title={<span className="flex flex-wrap items-center gap-3">{editing ? t("quotes.editTitle") : `${t("nav.quotes")} ${q.number}`} <StatusBadge kind="quote" status={q.status} /></span>}
        subtitle={`${q.client.name} · ${q.title}`}
        actions={!editing && <PdfActions path={`/quotes/${q.id}/pdf`} filename={q.number} defaultLang={q.language} />}
      />

      {editing ? (
        <DocumentEditor kind="quote" initial={initial} onSubmit={save} saving={saving} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Card title={t("common.details")}>
              <InfoGrid items={[
                [t("quotes.client"), <Link key="c" href={`/clients/${q.client.id}`} className="text-brand hover:underline">{q.client.name}</Link>],
                [t("quotes.issueDate"), formatDate(q.issue_date, lang)],
                [t("quotes.validityDate"), formatDate(q.validity_date, lang)],
                [t("quotes.siteAddress"), q.site_address],
                [t("quotes.pdfLanguage"), q.language === "ar" ? "العربية" : "Français"],
                [t("quotes.invoiceLink", { number: "" }).trim(), q.invoice_id && <Link key="i" href={`/invoices/${q.invoice_id}`} className="text-brand hover:underline">{q.invoice_number}</Link>],
              ]} />
            </Card>
            <Card padded={false} title={t("quotes.step3")}>
              <LinesTable items={q.items} />
              <div className="p-5">
                <TotalsBox rows={[
                  { label: t("lines.subtotal"), value: q.subtotal_ht },
                  ...(toNumber(q.total_discount) ? [{ label: t("lines.totalDiscount"), value: q.total_discount, negative: true }] : []),
                  { label: t("lines.netHt"), value: q.total_ht, strong: true },
                  { label: t("lines.totalTva"), value: q.total_tva },
                  { label: t("lines.grandTotal"), value: q.total_ttc, highlight: true },
                ]} />
              </div>
            </Card>
            {(q.payment_terms || q.special_conditions || q.notes) && (
              <Card>
                <div className="grid gap-4 md:grid-cols-3 text-sm">
                  {q.payment_terms && <div><p className="text-xs font-semibold text-slate-500">{t("quotes.paymentTerms")}</p><p className="whitespace-pre-line">{q.payment_terms}</p></div>}
                  {q.special_conditions && <div><p className="text-xs font-semibold text-slate-500">{t("quotes.specialConditions")}</p><p className="whitespace-pre-line">{q.special_conditions}</p></div>}
                  {q.notes && <div><p className="text-xs font-semibold text-slate-500">{t("quotes.internalNotes")}</p><p className="whitespace-pre-line">{q.notes}</p></div>}
                </div>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            {manage && (
              <Card title={t("common.actions")}>
                <div className="flex flex-col gap-2">
                  {q.status !== "accepted" && <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>{t("common.edit")}</Button>}
                  {["draft", "sent", "expired"].includes(q.status) && <Button icon={<Send className="h-4 w-4" />} onClick={() => { setEmail(q.client.email ?? ""); setSendOpen(true); }}>{t("common.send")}</Button>}
                  {q.status === "draft" && <Button variant="secondary" onClick={() => changeStatus("sent")} loading={busy}>{t("quotes.markSent")}</Button>}
                  {q.status === "sent" && <>
                    <Button className="bg-emerald-600 hover:bg-emerald-700" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setDecision("accepted")}>{t("quotes.accept")}</Button>
                    <Button variant="danger" icon={<XCircle className="h-4 w-4" />} onClick={() => setDecision("refused")}>{t("quotes.refuse")}</Button>
                  </>}
                  {["sent", "refused", "expired"].includes(q.status) && <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => changeStatus("draft")}>{t("quotes.backToDraft")}</Button>}
                  {q.status === "accepted" && !q.invoice_id && can("invoices.manage") && (
                    <Button variant="accent" icon={<FileText className="h-4 w-4" />} onClick={() => { setStamp(settings?.apply_stamp_duty ?? true); setConvertOpen(true); }}>{t("quotes.convert")}</Button>
                  )}
                  <Button variant="ghost" icon={<Copy className="h-4 w-4" />} onClick={duplicate}>{t("common.duplicate")}</Button>
                </div>
                {q.status === "accepted" && <p className="mt-3 text-xs text-slate-500">{t("quotes.locked")}</p>}
              </Card>
            )}
            <Card title={t("invoices.history")}>
              <ul className="space-y-2 text-sm text-slate-600">
                <li>{t("common.createdAt")} : {formatDateTime(q.created_at, lang)}</li>
                {q.sent_at && <li>{t("status.quote.sent")} : {formatDateTime(q.sent_at, lang)}</li>}
                {q.decided_at && <li>{t(`status.quote.${q.status}`)} : {formatDateTime(q.decided_at, lang)}</li>}
                {q.decision_comment && <li className="rounded-lg bg-surface p-2">{t("quotes.decisionComment")} : {q.decision_comment}</li>}
              </ul>
            </Card>
          </div>
        </div>
      )}

      <Modal open={sendOpen} onClose={() => setSendOpen(false)} title={t("common.send")}>
        <div className="space-y-4">
          <Field label={t("common.email")}><Input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Button className="w-full" icon={<Mail className="h-4 w-4" />} onClick={sendEmail} loading={busy} disabled={!email}>{t("quotes.sendEmail")}</Button>
          <Button className="w-full bg-emerald-600 hover:bg-emerald-700" icon={<MessageCircle className="h-4 w-4" />} onClick={shareWhatsapp} disabled={!q.client.whatsapp && !q.client.phone}>{t("quotes.shareWhatsapp")}</Button>
        </div>
      </Modal>

      <ConfirmDialog open={!!decision} onClose={() => setDecision(null)} loading={busy}
        title={decision === "accepted" ? t("quotes.accept") : t("quotes.refuse")} danger={decision === "refused"}
        onConfirm={() => decision && changeStatus(decision, comment)}>
        <Field label={t("quotes.decisionComment")}><Textarea value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      </ConfirmDialog>

      <ConfirmDialog open={convertOpen} onClose={() => setConvertOpen(false)} onConfirm={convert} loading={busy} title={t("quotes.convertTitle")} text={t("quotes.convertText")}>
        <div className="mt-3"><Checkbox label={`${t("quotes.applyStamp")} (${formatMoney(settings?.stamp_duty ?? 1, lang)})`} checked={stamp} onChange={setStamp} /></div>
      </ConfirmDialog>
    </>
  );
}
