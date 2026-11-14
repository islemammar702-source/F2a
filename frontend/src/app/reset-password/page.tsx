"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import LanguageSwitch from "@/components/LanguageSwitch";
import { Logo } from "@/components/Logo";
import { errorMessage } from "@/components/Toast";
import { Button, Card, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function ResetPasswordPage() {
  return <Suspense><Reset /></Suspense>;
}

function Reset() {
  const { t } = useI18n();
  const token = useSearchParams().get("token") ?? "";
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw !== confirm) return setError(t("auth.mismatch"));
    setBusy(true);
    setError("");
    try {
      await api("/auth/reset-password", { method: "POST", body: { token, new_password: pw } });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="flex w-full max-w-sm items-center justify-between"><Logo /><LanguageSwitch /></div>
      <Card className="w-full max-w-sm" title={t("auth.resetTitle")}>
        {done ? (
          <div className="space-y-4 text-sm">
            <p className="rounded-lg bg-emerald-50 p-3 text-emerald-800">{t("auth.resetDone")}</p>
            <Link href="/login"><Button className="w-full">{t("auth.submit")}</Button></Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <Field label={t("auth.newPassword")} hint={t("auth.passwordHint")}><Input type="password" autoComplete="new-password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} required /></Field>
            <Field label={t("auth.confirmPassword")}><Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></Field>
            <Button type="submit" className="w-full" loading={busy} disabled={!token}>{t("common.save")}</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
