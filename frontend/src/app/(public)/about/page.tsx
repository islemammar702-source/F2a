"use client";

import { Award, Target } from "lucide-react";
import { CtaBand, PageHero, STATS, ToneIcon } from "@/components/PublicSite";
import { useI18n } from "@/lib/i18n";

export default function AboutPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHero title={t("public.aboutTitle")} text={t("common.tagline")} />
      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
        <div>
          <span className="eyebrow text-brand">F2A TRAVAUX</span>
          <p className="mt-4 text-lg leading-relaxed text-slate-700">{t("public.aboutText")}</p>
          <div className="mt-8 grid grid-cols-3 gap-4">
            {STATS.map(([v, k]) => (
              <div key={k} className="relative overflow-hidden rounded-2xl bg-navy p-5 text-center"><div className="blueprint pointer-events-none absolute inset-0" /><p className="relative font-display text-3xl font-extrabold text-thermal">{v}</p><p className="relative mt-1 text-xs text-white/60">{t(`public.${k}`)}</p></div>
            ))}
          </div>
        </div>
        <div className="space-y-5">
          <div className="rounded-2xl bg-white p-7 ring-1 ring-slate-200/80"><ToneIcon tone="cold" solid className="mb-4"><Target className="h-6 w-6" /></ToneIcon><h2 className="text-lg font-bold text-navy">{t("public.aboutMission")}</h2><p className="mt-2 text-slate-600">{t("public.aboutMissionText")}</p></div>
          <div className="rounded-2xl bg-white p-7 ring-1 ring-slate-200/80"><ToneIcon tone="hot" solid className="mb-4"><Award className="h-6 w-6" /></ToneIcon><h2 className="text-lg font-bold text-navy">{t("public.aboutValues")}</h2><p className="mt-2 text-slate-600">{t("public.aboutValuesText")}</p></div>
        </div>
      </section>
      <CtaBand />
    </>
  );
}
