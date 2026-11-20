"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { errorMessage } from "./Toast";
import { Button, Field, Input, Select, Textarea } from "./ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export const SERVICE_CODES = ["heating", "ventilation", "ac", "solar", "plumbing", "sanitary", "fluids", "maintenance", "repair", "other"];

/** Quote request form, used on the public site (/request-quote) and in the client portal. */
export default function RequestForm({ endpoint, defaults, onDone }: { endpoint: string; defaults?: { name?: string; phone?: string; email?: string }; onDone?: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState({ name: defaults?.name ?? "", phone: defaults?.phone ?? "", email: defaults?.email ?? "", service: "heating", address: "", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(endpoint, { method: "POST", body: { ...f, email: f.email || null, address: f.address || null } });
      setSent(true);
      onDone?.();
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-500" />
        <p className="max-w-md text-slate-700">{t("public.requestSent")}</p>
        <Button variant="outline" onClick={() => { setSent(false); setF((x) => ({ ...x, message: "", address: "" })); }}>{t("portal.newRequest")}</Button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">{error}</p>}
      <Field label={t("common.name")} required><Input value={f.name} onChange={set("name")} required minLength={2} /></Field>
      <Field label={t("common.phone")} required><Input type="tel" dir="ltr" value={f.phone} onChange={set("phone")} required minLength={6} placeholder="+216 …" /></Field>
      <Field label={t("common.email")}><Input type="email" dir="ltr" value={f.email} onChange={set("email")} /></Field>
      <Field label={t("public.service")} required>
        <Select value={f.service} onChange={set("service")}>{SERVICE_CODES.map((s) => <option key={s} value={s}>{t(`services.${s}`)}</option>)}</Select>
      </Field>
      <Field label={t("common.address")} className="sm:col-span-2"><Input value={f.address} onChange={set("address")} /></Field>
      <Field label={t("public.projectDescription")} required className="sm:col-span-2"><Textarea rows={5} value={f.message} onChange={set("message")} required minLength={5} /></Field>
      {/* honeypot field, hidden from humans */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} className="hidden" aria-hidden="true" />
      <div className="sm:col-span-2"><Button type="submit" variant="accent" size="lg" loading={busy} className="w-full sm:w-auto">{t("common.send")}</Button></div>
    </form>
  );
}
