"use client";

import { Languages } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function LanguageSwitch({ light = false }: { light?: boolean }) {
  const { lang, setLang, t } = useI18n();
  const { user, setUser } = useAuth();
  const next = lang === "fr" ? "ar" : "fr";
  const change = () => {
    setLang(next);
    if (user) {
      api("/auth/me", { method: "PATCH", body: { language: next } }).then((u) => setUser(u as typeof user)).catch(() => {});
    }
  };
  return (
    <button
      onClick={change}
      title={t("common.language")}
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold transition ${light ? "text-white/90 hover:bg-white/10" : "text-slate-600 hover:bg-slate-100"}`}
    >
      <Languages className="h-4 w-4" />
      <span>{next === "ar" ? "العربية" : "Français"}</span>
    </button>
  );
}
