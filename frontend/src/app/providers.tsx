"use client";

import type { ReactNode } from "react";
import { I18nProvider, type Lang } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/components/Toast";

export default function Providers({ children, lang }: { children: ReactNode; lang: Lang }) {
  return (
    <I18nProvider initialLang={lang}>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </I18nProvider>
  );
}
