"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import fr, { type Dict } from "./fr";
import ar from "./ar";

export type Lang = "fr" | "ar";
const DICTS: Record<Lang, Dict> = { fr, ar };
const STORAGE_KEY = "f2a_lang";

function lookup(dict: Dict, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      // keys such as "perm.quotes.view" contain dots inside the leaf name
      const rest = key.slice(key.indexOf(part));
      if (cur && typeof cur === "object" && rest in (cur as Record<string, unknown>)) {
        return (cur as Record<string, string>)[rest];
      }
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  let s = lookup(DICTS[lang], key) ?? lookup(DICTS.fr, key) ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

type Ctx = {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (l: Lang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  dict: Dict;
};

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children, initialLang = "fr" }: { children: ReactNode; initialLang?: Lang }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "ar" || saved === "fr") setLangState(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.cookie = `f2a_lang=${lang}; path=/; max-age=31536000; samesite=lax`;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      dir: lang === "ar" ? "rtl" : "ltr",
      setLang,
      t: (key, params) => translate(lang, key, params),
      dict: DICTS[lang],
    }),
    [lang, setLang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
