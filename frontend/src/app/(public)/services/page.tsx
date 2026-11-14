"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CtaBand, PageHero, SERVICES, ToneIcon } from "@/components/PublicSite";
import { useI18n } from "@/lib/i18n";

export default function ServicesPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHero title={t("public.servicesTitle")} text={t("public.servicesText")} />
      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-20 sm:px-6 md:grid-cols-2">
        {SERVICES.map((s, i) => (
          <div key={s.code} className="group relative flex gap-5 overflow-hidden rounded-2xl bg-white p-7 ring-1 ring-slate-200/80 transition hover:-translate-y-0.5 hover:shadow-lift">
            <span className={`absolute inset-y-0 start-0 w-1 ${s.tone === "hot" ? "bg-gradient-to-b from-flame-yellow to-flame-red" : "bg-gradient-to-b from-ice to-brand"}`} />
            <ToneIcon tone={s.tone} solid className="h-14 w-14 rounded-2xl">{s.icon}</ToneIcon>
            <div className="flex-1">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold text-navy">{t(`services.${s.code}`)}</h2>
                <span className="font-mono text-xs text-slate-300">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <p className="mt-2 leading-relaxed text-slate-600">{t(`public.${s.code}Text`)}</p>
              <Link href="/request-quote" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-600 hover:gap-2.5 hover:text-accent transition-all">{t("nav.requestQuote")} <ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link>
            </div>
          </div>
        ))}
      </section>
      <CtaBand />
    </>
  );
}
