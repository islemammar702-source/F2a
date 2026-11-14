"use client";

import { useEffect, useState } from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { RequirePermission } from "@/components/AppShell";
import { LogoMark } from "@/components/Logo";
import { useToast } from "@/components/Toast";
import { Button, Card, Checkbox, Field, Input, Loading, PageHeader, Select, Tabs, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { toNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { setSettingsCache } from "@/lib/useSettings";
import type { CompanySettings, PaymentMethod } from "@/lib/types";

export default function SettingsPage() {
  return <RequirePermission perm="settings.manage"><Settings /></RequirePermission>;
}

type Tab = "company" | "finance" | "numbering" | "documents";

function Settings() {
  const { t } = useI18n();
  const toast = useToast();
  const [s, setS] = useState<CompanySettings | null>(null);
  const [tab, setTab] = useState<Tab>("company");
  const [ratesText, setRatesText] = useState("");
  const [saving, setSaving] = useState(false);
  const [logoKey, setLogoKey] = useState(0);

  useEffect(() => {
    api<CompanySettings>("/settings").then((x) => { setS(x); setRatesText(x.tax_rates.map(toNumber).join(", ")); }).catch(toast.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) return <Loading />;
  const set = <K extends keyof CompanySettings>(k: K, v: CompanySettings[K]) => setS((x) => (x ? { ...x, [k]: v } : x));
  const txt = (k: keyof CompanySettings) => ({ value: String(s[k] ?? ""), onChange: (e: { target: { value: string } }) => set(k, e.target.value as never) });

  const save = async () => {
    setSaving(true);
    try {
      const rates = ratesText.split(/[,;\s]+/).filter(Boolean).map(Number).filter((n) => Number.isFinite(n));
      const { logo_document_id, currency, ...rest } = s; // eslint-disable-line @typescript-eslint/no-unused-vars
      const body = Object.fromEntries(Object.entries({ ...rest, tax_rates: rates }).map(([k, v]) => [k, v === "" ? null : v]));
      const saved = await api<CompanySettings>("/settings", { method: "PATCH", body });
      setS(saved);
      setSettingsCache(saved);
      toast.success(t("settings.saved"));
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const saved = await api<CompanySettings>("/settings/logo", { method: "POST", form: fd });
      setS(saved);
      setLogoKey((k) => k + 1);
      toast.success(t("settings.saved"));
    } catch (e) {
      toast.error(e);
    }
  };
  const removeLogo = async () => {
    const saved = await api<CompanySettings>("/settings/logo", { method: "DELETE" });
    setS(saved);
  };

  const setMethod = (i: number, patch: Partial<PaymentMethod>) => set("payment_methods", s.payment_methods.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const example = `${s.invoice_prefix}-${new Date().getFullYear()}-${"1".padStart(s.number_padding, "0")}`;

  return (
    <>
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} actions={<Button variant="accent" onClick={save} loading={saving}>{t("common.save")}</Button>} />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { id: "company", label: t("settings.company") }, { id: "finance", label: t("settings.finance") },
        { id: "numbering", label: t("settings.numbering") }, { id: "documents", label: t("settings.documents") },
      ]} />

      {tab === "company" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title={t("settings.logo")}>
            <div className="flex flex-col items-center gap-4">
              {s.logo_document_id
                // eslint-disable-next-line @next/next/no-img-element
                ? <img key={logoKey} src={`/api/public/logo?v=${logoKey}`} alt="logo" className="h-24 max-w-full object-contain" />
                : <LogoMark className="h-24 w-24" />}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-50 px-4 py-2 text-sm font-semibold text-brand hover:bg-brand-100">
                <ImagePlus className="h-4 w-4" />{t("settings.uploadLogo")}
                <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
              </label>
              {s.logo_document_id && <Button size="sm" variant="ghost" onClick={removeLogo}>{t("settings.removeLogo")}</Button>}
            </div>
          </Card>
          <Card className="lg:col-span-2" title={t("settings.company")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("settings.name")} required className="sm:col-span-2"><Input {...txt("name")} /></Field>
              <Field label={t("settings.taglineFr")}><Input {...txt("tagline_fr")} /></Field>
              <Field label={t("settings.taglineAr")}><Input dir="rtl" {...txt("tagline_ar")} /></Field>
              <Field label={t("common.address")}><Input {...txt("address")} /></Field>
              <Field label={t("common.city")}><Input {...txt("city")} /></Field>
              <Field label={t("common.phone")}><Input dir="ltr" {...txt("phone")} /></Field>
              <Field label="WhatsApp"><Input dir="ltr" {...txt("whatsapp")} /></Field>
              <Field label={t("common.email")}><Input type="email" dir="ltr" {...txt("email")} /></Field>
              <Field label={t("settings.website")}><Input dir="ltr" {...txt("website")} /></Field>
              <Field label={t("settings.taxId")}><Input dir="ltr" {...txt("tax_id")} /></Field>
              <Field label={t("settings.tradeRegister")}><Input dir="ltr" {...txt("trade_register")} /></Field>
            </div>
          </Card>
        </div>
      )}

      {tab === "finance" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={t("settings.finance")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("settings.currency")}><Input value="TND – Dinar tunisien" disabled /></Field>
              <Field label={t("settings.taxRates")} hint="0, 7, 13, 19"><Input dir="ltr" value={ratesText} onChange={(e) => setRatesText(e.target.value)} /></Field>
              <Field label={t("settings.defaultTaxRate")}>
                <Select value={String(toNumber(s.default_tax_rate))} onChange={(e) => set("default_tax_rate", e.target.value)}>
                  {ratesText.split(/[,;\s]+/).filter(Boolean).map((r) => <option key={r} value={String(Number(r))}>{r} %</option>)}
                </Select>
              </Field>
              <Field label={t("settings.stampDuty")}><Input type="number" step="0.001" min="0" dir="ltr" value={String(s.stamp_duty)} onChange={(e) => set("stamp_duty", e.target.value)} /></Field>
              <div className="sm:col-span-2"><Checkbox label={t("settings.applyStamp")} checked={s.apply_stamp_duty} onChange={(b) => set("apply_stamp_duty", b)} /></div>
              <Field label={t("settings.bankName")}><Input {...txt("bank_name")} /></Field>
              <Field label={t("settings.rib")}><Input dir="ltr" {...txt("bank_rib")} /></Field>
              <Field label={t("settings.iban")} className="sm:col-span-2"><Input dir="ltr" {...txt("bank_iban")} /></Field>
            </div>
          </Card>
          <Card title={t("settings.paymentMethods")} actions={<Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => set("payment_methods", [...s.payment_methods, { code: `mode_${s.payment_methods.length + 1}`, label_fr: "", label_ar: "", active: true }])}>{t("settings.addMethod")}</Button>}>
            <div className="space-y-3">
              {s.payment_methods.map((m, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-12 sm:items-end">
                  <Field label={t("settings.code")} className="sm:col-span-3"><Input dir="ltr" value={m.code} onChange={(e) => setMethod(i, { code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} /></Field>
                  <Field label={t("settings.labelFr")} className="sm:col-span-3"><Input value={m.label_fr} onChange={(e) => setMethod(i, { label_fr: e.target.value })} /></Field>
                  <Field label={t("settings.labelAr")} className="sm:col-span-3"><Input dir="rtl" value={m.label_ar} onChange={(e) => setMethod(i, { label_ar: e.target.value })} /></Field>
                  <div className="flex items-center gap-2 pb-2 sm:col-span-3">
                    <Checkbox label={t("settings.activeMethod")} checked={m.active} onChange={(b) => setMethod(i, { active: b })} />
                    <button className="ms-auto rounded-lg p-1.5 text-red-500 hover:bg-red-50" onClick={() => set("payment_methods", s.payment_methods.filter((_, j) => j !== i))} aria-label={t("common.remove")}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === "numbering" && (
        <Card title={t("settings.numbering")}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("settings.quotePrefix")}><Input dir="ltr" value={s.quote_prefix} onChange={(e) => set("quote_prefix", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} /></Field>
            <Field label={t("settings.invoicePrefix")}><Input dir="ltr" value={s.invoice_prefix} onChange={(e) => set("invoice_prefix", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} /></Field>
            <Field label={t("settings.paymentPrefix")}><Input dir="ltr" value={s.payment_prefix} onChange={(e) => set("payment_prefix", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} /></Field>
            <Field label={t("settings.padding")} hint={t("settings.numberPreview", { example })}><Input type="number" min={2} max={6} value={s.number_padding} onChange={(e) => set("number_padding", Number(e.target.value))} /></Field>
            <Field label={t("settings.quoteValidity")}><Input type="number" min={1} max={365} value={s.quote_validity_days} onChange={(e) => set("quote_validity_days", Number(e.target.value))} /></Field>
            <Field label={t("settings.invoiceDue")}><Input type="number" min={0} max={365} value={s.invoice_due_days} onChange={(e) => set("invoice_due_days", Number(e.target.value))} /></Field>
          </div>
        </Card>
      )}

      {tab === "documents" && (
        <Card title={t("settings.documents")}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("settings.paymentTermsFr")}><Textarea {...txt("payment_terms_fr")} /></Field>
            <Field label={t("settings.paymentTermsAr")}><Textarea dir="rtl" {...txt("payment_terms_ar")} /></Field>
            <Field label={t("settings.termsFr")}><Textarea rows={5} {...txt("terms_fr")} /></Field>
            <Field label={t("settings.termsAr")}><Textarea dir="rtl" rows={5} {...txt("terms_ar")} /></Field>
            <Field label={t("settings.footerFr")}><Input {...txt("footer_fr")} /></Field>
            <Field label={t("settings.footerAr")}><Input dir="rtl" {...txt("footer_ar")} /></Field>
          </div>
        </Card>
      )}
    </>
  );
}
