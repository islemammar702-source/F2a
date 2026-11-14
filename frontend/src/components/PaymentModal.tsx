"use client";

import { useEffect, useState } from "react";
import { Paperclip } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { formatMoney, round3, todayISO, toNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useCompanySettings } from "@/lib/useSettings";
import type { DocumentFile, InvoiceListItem, Page, Payment } from "@/lib/types";
import { useToast } from "./Toast";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";

export default function PaymentModal({ open, onClose, invoice, onSaved }: { open: boolean; onClose: () => void; invoice?: InvoiceListItem | null; onSaved: (p: Payment) => void }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const settings = useCompanySettings();
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setInvoiceId(invoice?.id ?? "");
    setAmount(invoice ? String(toNumber(invoice.balance)) : "");
    setDate(todayISO());
    setReference("");
    setComment("");
    setFile(null);
    if (!invoice) {
      api<Page<InvoiceListItem>>("/invoices", { query: { open_only: true, page_size: 100 } }).then((p) => setInvoices(p.items)).catch(toast.error);
    }
  }, [open, invoice]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const first = settings?.payment_methods.find((m) => m.active);
    if (first && !method) setMethod(first.code);
  }, [settings, method]);

  const current = invoice ?? invoices.find((i) => i.id === invoiceId);
  const balance = toNumber(current?.balance);
  const after = round3(balance - toNumber(amount));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current) return;
    if (toNumber(amount) <= 0 || toNumber(amount) > balance) {
      toast.error(new ApiError(400, "amount_exceeds_balance"));
      return;
    }
    setSaving(true);
    try {
      let proof: string | null = null;
      if (file) {
        if (file.size > 10 * 1024 * 1024) throw new Error("too big");
        const fd = new FormData();
        fd.append("file", file);
        proof = (await api<DocumentFile>("/payments/proof", { method: "POST", form: fd })).id;
      }
      const p = await api<Payment>("/payments", {
        method: "POST",
        body: { invoice_id: current.id, amount: String(toNumber(amount)), payment_date: date, method, reference: reference || null, comment: comment || null, proof_document_id: proof },
      });
      toast.success(`${t("payments.created")} – ${p.number}`);
      onSaved(p);
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("payments.new")} footer={
      <>
        <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" form="payment-form" loading={saving} disabled={!current}>{t("common.save")}</Button>
      </>
    }>
      <form id="payment-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {invoice ? (
          <div className="rounded-lg bg-surface p-3 text-sm sm:col-span-2">
            <b>{invoice.number}</b> · {invoice.client.name}
            <div className="mt-1 flex justify-between text-slate-600"><span>{t("invoices.balance")}</span><b className="tabular-nums">{formatMoney(invoice.balance, lang)}</b></div>
          </div>
        ) : (
          <Field label={t("payments.invoice")} required className="sm:col-span-2">
            <Select value={invoiceId} onChange={(e) => {
              setInvoiceId(e.target.value);
              const inv = invoices.find((i) => i.id === e.target.value);
              setAmount(inv ? String(toNumber(inv.balance)) : "");
            }}>
              <option value="">{t("payments.selectInvoice")}</option>
              {invoices.map((i) => <option key={i.id} value={i.id}>{i.number} – {i.client.name} – {formatMoney(i.balance, lang)}</option>)}
            </Select>
          </Field>
        )}
        <Field label={`${t("common.amount")} (DT)`} required hint={current ? t("payments.maxAmount", { amount: formatMoney(balance, lang) }) : undefined}>
          <Input type="number" inputMode="decimal" step="0.001" min="0.001" max={balance || undefined} dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t("common.date")} required><Input type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={t("payments.method")} required>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {settings?.payment_methods.filter((m) => m.active).map((m) => <option key={m.code} value={m.code}>{lang === "ar" ? m.label_ar : m.label_fr}</option>)}
          </Select>
        </Field>
        <Field label={t("common.reference")} hint={t("common.optional")}><Input dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="N° chèque / virement" /></Field>
        <Field label={t("common.comment")} className="sm:col-span-2"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
        <Field label={t("payments.proof")} className="sm:col-span-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-600 hover:border-brand">
            <Paperclip className="h-4 w-4" />
            <span className="truncate">{file?.name ?? t("payments.uploadProof")}</span>
            <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </Field>
        {current && toNumber(amount) > 0 && (
          <p className={`text-sm sm:col-span-2 ${after < 0 ? "text-red-600" : "text-slate-600"}`}>
            {t("payments.remainingAfter")} : <b className="tabular-nums">{formatMoney(after, lang)}</b>
          </p>
        )}
      </form>
    </Modal>
  );
}
