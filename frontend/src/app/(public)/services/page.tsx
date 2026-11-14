"use client";

import Link from "next/link";
import { CtaBand, PageHero, SERVICES } from "@/components/PublicSite";
import { useI18n } from "@/lib/i18n";

export default function ServicesPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHero title={t("public.servicesTitle")} text={t("public.servicesText")} />
      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-16 sm:px-6 md:grid-cols-2">
        {SERVICES.map((s) => (
          <div key={s.code} className="flex gap-5 rounded-2xl border border-slate-200 p-6 transition hover:border-brand hover:shadow-card">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand text-white">{s.icon}</div>
            <div>
              <h2 className="text-lg font-bold text-navy">{t(`services.${s.code}`)}</h2>
              <p className="mt-2 text-slate-600">{t(`public.${s.code}Text`)}</p>
              <Link href="/request-quote" className="mt-3 inline-block text-sm font-semibold text-accent-600 hover:underline">{t("nav.requestQuote")} →</Link>
            </div>
          </div>
        ))}
      </section>
      <CtaBand />
    </>
  );
}
