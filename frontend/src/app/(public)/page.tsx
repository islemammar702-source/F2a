"use client";

import Link from "next/link";
import { ArrowRight, BadgeCheck, Clock, FileCheck2, Users } from "lucide-react";
import { CtaBand, PROJECTS, ProjectCard, SERVICES } from "@/components/PublicSite";
import { Button } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

export default function HomePage() {
  const { t } = useI18n();
  const why = [
    [<Users key="1" className="h-6 w-6" />, "why1"], [<FileCheck2 key="2" className="h-6 w-6" />, "why2"],
    [<Clock key="3" className="h-6 w-6" />, "why3"], [<BadgeCheck key="4" className="h-6 w-6" />, "why4"],
  ] as const;
  return (
    <>
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="absolute -end-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-brand opacity-70 blur-3xl" />
        <div className="absolute -bottom-40 start-1/3 h-80 w-80 rounded-full bg-accent opacity-20 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-accent ring-1 ring-white/20">F2A TRAVAUX · {t("common.tagline")}</span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">{t("public.heroTitle")}</h1>
            <p className="mt-5 max-w-xl text-lg text-white/70">{t("public.heroText")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/request-quote"><Button variant="accent" size="lg">{t("public.ctaQuote")}</Button></Link>
              <Link href="/services"><Button size="lg" className="bg-white/10 ring-1 ring-white/30 hover:bg-white/20">{t("public.ctaServices")} <ArrowRight className="h-4 w-4 rtl:rotate-180" /></Button></Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {SERVICES.slice(0, 4).map((s, i) => (
              <div key={s.code} className={`rounded-2xl bg-white/10 p-6 ring-1 ring-white/15 backdrop-blur ${i % 2 ? "translate-y-6" : ""}`}>
                <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-navy">{s.icon}</div>
                <p className="font-bold">{t(`services.${s.code}`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-extrabold text-navy">{t("public.servicesTitle")}</h2>
          <p className="mt-2 text-slate-500">{t("public.servicesText")}</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((s) => (
            <Link key={s.code} href="/services" className="group rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-1 hover:border-brand hover:shadow-card">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand group-hover:bg-brand group-hover:text-white">{s.icon}</div>
              <h3 className="font-bold text-navy">{t(`services.${s.code}`)}</h3>
              <p className="mt-2 text-sm text-slate-500">{t(`public.${s.code}Text`)}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-surface py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="mb-10 text-center text-3xl font-extrabold text-navy">{t("public.whyTitle")}</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {why.map(([icon, k]) => (
              <div key={k} className="rounded-2xl bg-white p-6 shadow-card">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-accent-50 text-accent-600">{icon}</div>
                <h3 className="font-bold text-navy">{t(`public.${k}`)}</h3>
                <p className="mt-2 text-sm text-slate-500">{t(`public.${k}Text`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div><h2 className="text-3xl font-extrabold text-navy">{t("public.projectsTitle")}</h2><p className="mt-2 text-slate-500">{t("public.projectsText")}</p></div>
          <Link href="/projects" className="font-semibold text-brand hover:underline">{t("common.seeAll")} →</Link>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{PROJECTS.slice(0, 3).map((p) => <ProjectCard key={p.key} p={p} />)}</div>
      </section>
      <CtaBand />
    </>
  );
}
