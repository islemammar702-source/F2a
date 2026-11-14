"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { useI18n } from "./i18n";
import type { CompanySettings } from "./types";

let cache: CompanySettings | null = null;
const listeners = new Set<(s: CompanySettings) => void>();

export function setSettingsCache(s: CompanySettings) {
  cache = s;
  listeners.forEach((l) => l(s));
}

/** Company settings (tax rates, payment methods…) shared across pages. */
export function useCompanySettings() {
  const [s, setS] = useState<CompanySettings | null>(cache);
  useEffect(() => {
    listeners.add(setS);
    if (!cache) api<CompanySettings>("/settings").then(setSettingsCache).catch(() => {});
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}

export function useMethodLabel() {
  const s = useCompanySettings();
  const { lang } = useI18n();
  return (code: string) => {
    const m = s?.payment_methods.find((x) => x.code === code);
    return m ? (lang === "ar" ? m.label_ar : m.label_fr) : code;
  };
}
