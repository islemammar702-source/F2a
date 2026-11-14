"use client";

import { useState } from "react";
import { Monitor } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { Me } from "@/lib/types";
import { useToast } from "./Toast";
import { Badge, Button, Card, Field, Input, PageHeader, Select } from "./ui";

type Session = { id: string; user_agent: string | null; ip_address: string | null; created_at: string; expires_at: string; current: boolean };

export default function ProfileView() {
  const { user, setUser } = useAuth();
  const { t, lang, setLang } = useI18n();
  const toast = useToast();
  const sessions = useApi<Session[]>("/auth/sessions");
  const [p, setP] = useState({ full_name: user?.full_name ?? "", phone: user?.phone ?? "", language: user?.language ?? lang });
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState<string | null>(null);
  if (!user) return null;

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving("p");
    try {
      const u = await api<Me>("/auth/me", { method: "PATCH", body: { ...p, phone: p.phone || null } });
      setUser(u);
      setLang(u.language);
      toast.success(t("common.success"));
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(null);
    }
  };
  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) return toast.error(new Error(t("auth.mismatch")));
    setSaving("pw");
    try {
      await api("/auth/change-password", { method: "POST", body: { current_password: pw.current, new_password: pw.next } });
      toast.success(t("auth.passwordChanged"));
      setPw({ current: "", next: "", confirm: "" });
      sessions.reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(null);
    }
  };
  const revoke = async (id: string) => {
    await api(`/auth/sessions/${id}`, { method: "DELETE" }).catch(toast.error);
    sessions.reload();
  };

  return (
    <>
      <PageHeader title={t("common.profile")} subtitle={user.email} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("common.profile")}>
          <form onSubmit={saveProfile} className="grid gap-4">
            <Field label={t("users.fullName")}><Input value={p.full_name} onChange={(e) => setP({ ...p, full_name: e.target.value })} required minLength={2} /></Field>
            <Field label={t("common.email")}><Input value={user.email} disabled dir="ltr" /></Field>
            <Field label={t("common.phone")}><Input dir="ltr" value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} /></Field>
            <Field label={t("users.preferredLanguage")}>
              <Select value={p.language} onChange={(e) => setP({ ...p, language: e.target.value as "fr" | "ar" })}><option value="fr">Français</option><option value="ar">العربية</option></Select>
            </Field>
            <div className="flex items-center justify-between">
              <Badge color="blue">{lang === "ar" ? user.role.name_ar : user.role.name_fr}</Badge>
              <Button type="submit" loading={saving === "p"}>{t("common.save")}</Button>
            </div>
          </form>
        </Card>
        <Card title={t("auth.changePassword")}>
          <form onSubmit={changePw} className="grid gap-4">
            <Field label={t("auth.currentPassword")}><Input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></Field>
            <Field label={t("auth.newPassword")} hint={t("auth.passwordHint")}><Input type="password" autoComplete="new-password" minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required /></Field>
            <Field label={t("auth.confirmPassword")} error={pw.confirm && pw.confirm !== pw.next ? t("auth.mismatch") : undefined}><Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required /></Field>
            <div className="flex justify-end"><Button type="submit" loading={saving === "pw"}>{t("auth.changePassword")}</Button></div>
          </form>
        </Card>
        <Card title={t("auth.sessions")} className="lg:col-span-2" padded={false}>
          <ul className="divide-y divide-slate-100">
            {sessions.data?.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="flex min-w-0 items-center gap-3">
                  <Monitor className="h-5 w-5 shrink-0 text-slate-400" />
                  <span className="min-w-0"><span className="block truncate font-medium text-navy">{s.user_agent?.slice(0, 80) ?? "—"}</span><span className="text-xs text-slate-500">{s.ip_address} · {formatDateTime(s.created_at, lang)}</span></span>
                </span>
                {s.current ? <Badge color="green">{t("auth.currentSession")}</Badge> : <Button size="sm" variant="ghost" onClick={() => revoke(s.id)}>{t("auth.revoke")}</Button>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
