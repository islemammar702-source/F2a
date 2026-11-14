"use client";

import { Award, Target } from "lucide-react";
import { CtaBand, PageHero } from "@/components/PublicSite";
import { useI18n } from "@/lib/i18n";

export default function AboutPage() {
  const { t } = useI18n();
  const stats = [["15+", "stats1"], ["800+", "stats2"], ["600+", "stats3"]];
  return (
    <>
      <PageHero title={t("public.aboutTitle")} text={t("common.tagline")} />
      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
        <div>
          <p className="text-lg leading-relaxed text-slate-700">{t("public.aboutText")}</p>
          <div className="mt-8 grid grid-cols-3 gap-4">
            {stats.map(([v, k]) => (
              <div key={k} className="rounded-2xl bg-surface p-5 text-center"><p className="text-3xl font-extrabold text-brand">{v}</p><p className="mt-1 text-xs text-slate-500">{t(`public.${k}`)}</p></div>
            ))}
          </div>
        </div>
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 p-6"><Target className="mb-3 h-8 w-8 text-accent" /><h2 className="text-lg font-bold text-navy">{t("public.aboutMission")}</h2><p className="mt-2 text-slate-600">{t("public.aboutMissionText")}</p></div>
          <div className="rounded-2xl border border-slate-200 p-6"><Award className="mb-3 h-8 w-8 text-accent" /><h2 className="text-lg font-bold text-navy">{t("public.aboutValues")}</h2><p className="mt-2 text-slate-600">{t("public.aboutValuesText")}</p></div>
        </div>
      </section>
      <CtaBand />
    </>
  );
}
