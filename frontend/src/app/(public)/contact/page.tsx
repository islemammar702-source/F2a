"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { PageHero, usePublicCompany } from "@/components/PublicSite";
import { errorMessage } from "@/components/Toast";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { waLink } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export default function ContactPage() {
  const { t } = useI18n();
  const c = usePublicCompany();
  const [f, setF] = useState({ name: "", phone: "", email: "", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/public/contact", { method: "POST", body: { ...f, email: f.email || null } });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHero title={t("public.contactTitle")} text={t("public.contactText")} />
      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-3">
        <div className="space-y-4">
          {c?.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-4 rounded-2xl border border-slate-200 p-5 hover:border-brand"><Phone className="h-6 w-6 text-accent" /><span dir="ltr" className="font-semibold text-navy">{c.phone}</span></a>}
          {c?.whatsapp && <a href={waLink(c.whatsapp, "")} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 rounded-2xl border border-slate-200 p-5 hover:border-brand"><MessageCircle className="h-6 w-6 text-emerald-500" /><span className="font-semibold text-navy">WhatsApp</span></a>}
          {c?.email && <a href={`mailto:${c.email}`} className="flex items-center gap-4 rounded-2xl border border-slate-200 p-5 hover:border-brand"><Mail className="h-6 w-6 text-accent" /><span className="font-semibold text-navy">{c.email}</span></a>}
          {c?.address && <div className="flex items-center gap-4 rounded-2xl border border-slate-200 p-5"><MapPin className="h-6 w-6 text-accent" /><span className="text-navy">{c.address}{c.city ? `, ${c.city}` : ""}</span></div>}
          <div className="flex items-center gap-4 rounded-2xl border border-slate-200 p-5"><Clock className="h-6 w-6 text-accent" /><span className="text-navy">{t("public.hours")}</span></div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8 lg:col-span-2">
          {sent ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center"><CheckCircle2 className="h-12 w-12 text-emerald-500" /><p>{t("public.messageSent")}</p></div>
          ) : (
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">{error}</p>}
              <Field label={t("common.name")} required><Input value={f.name} onChange={set("name")} required minLength={2} /></Field>
              <Field label={t("common.phone")} required><Input type="tel" dir="ltr" value={f.phone} onChange={set("phone")} required minLength={6} /></Field>
              <Field label={t("common.email")} className="sm:col-span-2"><Input type="email" dir="ltr" value={f.email} onChange={set("email")} /></Field>
              <Field label={t("public.message")} required className="sm:col-span-2"><Textarea rows={6} value={f.message} onChange={set("message")} required minLength={5} /></Field>
              <input type="text" tabIndex={-1} autoComplete="off" className="hidden" value={f.website} onChange={set("website")} aria-hidden="true" />
              <div className="sm:col-span-2"><Button type="submit" variant="accent" size="lg" loading={busy}>{t("public.sendMessage")}</Button></div>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
