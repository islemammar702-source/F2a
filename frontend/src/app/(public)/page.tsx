"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, BadgeCheck, Clock, FileCheck2, Flame, Snowflake, Users } from "lucide-react";
import { CtaBand, PROJECTS, ProjectCard, SERVICES, STATS, SectionTitle, ThermalBar, ToneIcon } from "@/components/PublicSite";
import { Button } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

export default function HomePage() {
  const { t } = useI18n();
  const why = [
    [<Users key="1" className="h-6 w-6" />, "why1"], [<FileCheck2 key="2" className="h-6 w-6" />, "why2"],
    [<Clock key="3" className="h-6 w-6" />, "why3"], [<BadgeCheck key="4" className="h-6 w-6" />, "why4"],
  ] as const;
  const cold = SERVICES.filter((s) => s.tone === "cold").slice(0, 2);
  const hot = SERVICES.filter((s) => s.tone === "hot").slice(0, 2);

  return (
    <>
      {/* HERO — technical blueprint + chaud/froid glow */}
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="blueprint pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -start-40 top-10 h-[30rem] w-[30rem] rounded-full bg-ice opacity-20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -end-32 h-[32rem] w-[32rem] rounded-full bg-accent opacity-30 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 py-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-28">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-white/80 ring-1 ring-white/15">
              <Snowflake className="h-3.5 w-3.5 text-ice" /><Flame className="h-3.5 w-3.5 text-accent" />{t("common.tagline")}
            </span>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] sm:text-5xl lg:text-6xl">{t("public.heroTitle")}</h1>
            <div className="bg-thermal mt-6 h-1.5 w-28 rounded-full" />
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/65">{t("public.heroText")}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/request-quote"><Button variant="accent" size="lg">{t("public.ctaQuote")}</Button></Link>
              <Link href="/services"><Button size="lg" className="bg-white/5 ring-1 ring-white/25 hover:bg-white/10">{t("public.ctaServices")} <ArrowRight className="h-4 w-4 rtl:rotate-180" /></Button></Link>
            </div>
            <dl className="mt-12 grid max-w-lg grid-cols-3 divide-x divide-white/10 border-t border-white/10 pt-6 rtl:divide-x-reverse">
              {STATS.map(([v, k]) => (
                <div key={k} className="px-4 first:ps-0">
                  <dt className="font-display text-3xl font-extrabold text-thermal">{v}</dt>
                  <dd className="mt-1 text-xs text-white/55">{t(`public.${k}`)}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Technical panel: cold side / hot side, linked by the thermal scale */}
          <div className="relative rounded-3xl bg-white/[.04] p-5 ring-1 ring-white/10 backdrop-blur-sm sm:p-6">
            <div className="blueprint-fine pointer-events-none absolute inset-0 rounded-3xl" />
            <div className="relative mb-5 flex items-center justify-between font-mono text-[11px] uppercase tracking-widest text-white/40">
              <span>F2A · CVC</span><span>Plomberie · Fluides</span>
            </div>
            <div className="relative grid grid-cols-2 gap-4">
              {[...cold, ...hot].map((s) => (
                <Link key={s.code} href="/services" className="group rounded-2xl bg-navy/60 p-5 ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:ring-white/30">
                  <ToneIcon tone={s.tone} solid>{s.icon}</ToneIcon>
                  <p className="mt-4 font-semibold">{t(`services.${s.code}`)}</p>
                  <ArrowUpRight className="mt-2 h-4 w-4 text-white/30 transition group-hover:text-white rtl:-scale-x-100" />
                </Link>
              ))}
            </div>
            <div className="relative mt-6">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-ice"><Snowflake className="h-4 w-4" />{t("services.ac")}</span>
                <span className="flex items-center gap-1.5 text-accent">{t("services.heating")}<Flame className="h-4 w-4" /></span>
              </div>
              <div className="bg-thermal mt-2 h-2 rounded-full" />
              <div className="mt-1.5 flex justify-between font-mono text-[10px] text-white/35" dir="ltr"><span>16°C</span><span>22°C</span><span>45°C</span><span>70°C</span></div>
            </div>
          </div>
        </div>
        <ThermalBar />
      </section>

      {/* SERVICES — numbered technical cards */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <SectionTitle eyebrow={`01 · ${t("nav.services")}`} title={t("public.servicesTitle")} text={t("public.servicesText")} />
        <div className="grid gap-px overflow-hidden rounded-3xl bg-slate-200/80 ring-1 ring-slate-200/80 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((s, i) => (
            <Link key={s.code} href="/services" className="group relative bg-white p-7 transition hover:bg-surface">
              <span className={`absolute inset-x-0 top-0 h-1 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100 rtl:origin-right ${s.tone === "hot" ? "bg-gradient-to-r from-flame-yellow to-flame-red" : "bg-gradient-to-r from-brand to-ice"}`} />
              <div className="flex items-start justify-between">
                <ToneIcon tone={s.tone}>{s.icon}</ToneIcon>
                <span className="font-mono text-xs text-slate-300">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <h3 className="mt-5 font-bold text-navy">{t(`services.${s.code}`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{t(`public.${s.code}Text`)}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* WHY — clean, airy */}
      <section className="blueprint-light relative bg-surface py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionTitle center eyebrow={`02 · F2A TRAVAUX`} title={t("public.whyTitle")} />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {why.map(([icon, k], i) => (
              <div key={k} className="rounded-2xl bg-white p-7 shadow-card ring-1 ring-slate-200/60">
                <ToneIcon tone={i % 2 ? "hot" : "cold"} solid>{icon}</ToneIcon>
                <h3 className="mt-5 font-bold text-navy">{t(`public.${k}`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{t(`public.${k}Text`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PROJECTS */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionTitle eyebrow={`03 · ${t("nav.projects")}`} title={t("public.projectsTitle")} text={t("public.projectsText")} />
          <Link href="/projects" className="mb-12 inline-flex items-center gap-1.5 font-semibold text-brand hover:text-accent-600">{t("common.seeAll")} <ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{PROJECTS.slice(0, 3).map((p, i) => <ProjectCard key={p.key} p={p} index={i} />)}</div>
      </section>
      <CtaBand />
    </>
  );
}
