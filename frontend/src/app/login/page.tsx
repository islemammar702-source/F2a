"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
import LanguageSwitch from "@/components/LanguageSwitch";
import { Logo } from "@/components/Logo";
import { errorMessage } from "@/components/Toast";
import { Button, Checkbox, Field, Input, Modal } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export default function LoginPage() {
  return <Suspense><Login /></Suspense>;
}

function Login() {
  const { t } = useI18n();
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  const target = (isClient: boolean) => {
    const next = params.get("next");
    if (next && next.startsWith("/") && !next.startsWith("//")) {
      if (isClient === next.startsWith("/portal")) return next;
    }
    return isClient ? "/portal" : "/dashboard";
  };

  useEffect(() => {
    if (!loading && user) router.replace(target(user.role.is_client_role));
  }, [user, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const u = await login(email.trim(), password, remember);
      router.replace(target(u.role.is_client_role));
    } catch (err) {
      setError(errorMessage(err, t));
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-navy p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="blueprint pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -end-24 -top-24 h-96 w-96 rounded-full bg-ice opacity-20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -start-16 h-96 w-96 rounded-full bg-accent opacity-30 blur-3xl" />
        <div className="bg-thermal absolute inset-x-0 top-0 h-1" />
        <Link href="/" className="relative"><Logo light /></Link>
        <div className="relative">
          <span className="eyebrow text-ice">{t("nav.adminSpace")}</span>
          <h2 className="mt-4 text-4xl font-extrabold leading-tight xl:text-5xl">{t("common.company")}</h2>
          <div className="bg-thermal mt-6 h-1.5 w-24 rounded-full" />
          <p className="mt-6 max-w-md leading-relaxed text-white/65">{t("public.heroText")}</p>
        </div>
        <p className="relative flex items-center gap-2 text-sm text-white/60"><ShieldCheck className="h-4 w-4 text-accent" />{t("auth.secure")}</p>
      </div>
      <div className="flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6">
          <Link href="/" className="lg:invisible"><Logo /></Link>
          <LanguageSwitch />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-12">
          <form onSubmit={submit} className="w-full max-w-sm">
            <h1 className="text-2xl font-extrabold text-navy">{t("auth.title")}</h1>
            <p className="mt-1 text-sm text-slate-500">{t("auth.subtitle")}</p>
            {error && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="mt-6 space-y-4">
              <Field label={t("auth.email")}>
                <div className="relative">
                  <Mail className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input type="email" autoComplete="username" dir="ltr" className="ps-9 text-start" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                </div>
              </Field>
              <Field label={t("auth.password")}>
                <div className="relative">
                  <Lock className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input type={show ? "text" : "password"} autoComplete="current-password" className="px-9" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  <button type="button" onClick={() => setShow((s) => !s)} className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600" aria-label={show ? t("auth.hide") : t("auth.show")} title={show ? t("auth.hide") : t("auth.show")}>
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
              <div className="flex items-center justify-between">
                <Checkbox label={t("auth.remember")} checked={remember} onChange={setRemember} />
                <button type="button" onClick={() => setForgot(true)} className="text-sm font-semibold text-brand hover:underline">{t("auth.forgot")}</button>
              </div>
              <Button type="submit" size="lg" className="w-full" loading={busy}>{t("auth.submit")}</Button>
            </div>
          </form>
        </div>
      </div>
      <ForgotModal open={forgot} onClose={() => setForgot(false)} initialEmail={email} />
    </div>
  );
}

function ForgotModal({ open, onClose, initialEmail }: { open: boolean; onClose: () => void; initialEmail: string }) {
  const { t } = useI18n();
  const [email, setEmail] = useState(initialEmail);
  const [done, setDone] = useState<{ dev_reset_link?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) { setEmail(initialEmail); setDone(null); setError(""); }
  }, [open, initialEmail]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      setDone(await api<{ dev_reset_link?: string }>("/auth/forgot-password", { method: "POST", body: { email } }));
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={t("auth.forgotTitle")} size="sm">
      {done ? (
        <div className="space-y-3 text-sm">
          <p className="rounded-lg bg-emerald-50 p-3 text-emerald-800">{t("auth.linkSent")}</p>
          {done.dev_reset_link && <p className="break-all rounded-lg bg-surface p-3 text-xs">{t("auth.devLink")}<br /><a className="text-brand underline" href={done.dev_reset_link}>{done.dev_reset_link}</a></p>}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-slate-600">{t("auth.forgotText")}</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Field label={t("auth.email")}><Input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Button type="submit" className="w-full" loading={busy}>{t("auth.sendLink")}</Button>
        </form>
      )}
    </Modal>
  );
}
