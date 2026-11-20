"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Droplets, Fan, Flame, Gauge, LifeBuoy, Mail, MapPin, Menu, Phone, ShowerHead, Snowflake, Sun, Wrench, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import LanguageSwitch from "./LanguageSwitch";
import { Logo } from "./Logo";
import { Button, cx } from "./ui";

export type PublicCompany = { name: string; address: string | null; city: string | null; phone: string | null; whatsapp: string | null; email: string | null };

export function usePublicCompany() {
  const [c, setC] = useState<PublicCompany | null>(null);
  useEffect(() => {
    api<PublicCompany>("/public/company").then(setC).catch(() => {});
  }, []);
  return c;
}

export type Tone = "hot" | "cold";

// Figures shown on the home and about pages: update them with F2A's real numbers.
export const STATS: [string, string][] = [["15+", "stats1"], ["800+", "stats2"], ["600+", "stats3"]];

export const SERVICES: { code: string; icon: ReactNode; tone: Tone }[] = [
  { code: "heating", icon: <Flame className="h-6 w-6" />, tone: "hot" },
  { code: "ventilation", icon: <Fan className="h-6 w-6" />, tone: "cold" },
  { code: "ac", icon: <Snowflake className="h-6 w-6" />, tone: "cold" },
  { code: "solar", icon: <Sun className="h-6 w-6" />, tone: "hot" },
  { code: "plumbing", icon: <Droplets className="h-6 w-6" />, tone: "cold" },
  { code: "sanitary", icon: <ShowerHead className="h-6 w-6" />, tone: "hot" },
  { code: "fluids", icon: <Gauge className="h-6 w-6" />, tone: "cold" },
  { code: "maintenance", icon: <Wrench className="h-6 w-6" />, tone: "hot" },
  { code: "repair", icon: <LifeBuoy className="h-6 w-6" />, tone: "hot" },
];

// Icon tile coloured by tone: ice blue for cold services, flame for hot ones.
export function ToneIcon({ tone, children, solid = false, className = "" }: { tone: Tone; children: ReactNode; solid?: boolean; className?: string }) {
  const c = solid
    ? tone === "hot" ? "bg-gradient-to-br from-flame-yellow via-accent to-flame-red text-white" : "bg-gradient-to-br from-ice to-brand text-white"
    : tone === "hot" ? "bg-accent-50 text-accent-600 ring-1 ring-accent-100" : "bg-ice-50 text-brand ring-1 ring-ice-100";
  return <div className={cx("inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", c, className)}>{children}</div>;
}

// Thin ice → flame line used as a signature accent across the site
export function ThermalBar({ className = "" }: { className?: string }) {
  return <div className={cx("bg-thermal h-1", className)} aria-hidden />;
}

// Technical caption ("01 / Services") above section titles
export function SectionTitle({ eyebrow, title, text, center = false, light = false }: { eyebrow: string; title: string; text?: string; center?: boolean; light?: boolean }) {
  return (
    <div className={cx("mb-12", center && "mx-auto max-w-2xl text-center")}>
      <span className={cx("eyebrow", light ? "text-ice" : "text-brand")}>{eyebrow}</span>
      <h2 className={cx("mt-3 text-3xl font-extrabold sm:text-4xl", light ? "text-white" : "text-navy")}>{title}</h2>
      {text && <p className={cx("mt-3 text-lg", light ? "text-white/65" : "text-slate-500")}>{text}</p>}
    </div>
  );
}

export function PublicHeader() {
  const { t } = useI18n();
  const { user } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = [["/", t("nav.home")], ["/about", t("nav.about")], ["/services", t("nav.services")], ["/projects", t("nav.projects")], ["/contact", t("nav.contact")]];
  // Logged out → "Connexion" (same page for admin, staff and clients); logged in → their own space
  const space = user ? (user.role.is_client_role ? "/portal" : "/dashboard") : "/login";
  const spaceLabel = !user ? t("nav.login") : user.role.is_client_role ? t("nav.clientSpace") : t("nav.adminSpace");
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/90 backdrop-blur-md">
      <ThermalBar />
      <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/"><Logo /></Link>
        <nav className="hidden items-center gap-1 lg:flex">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className={cx("relative px-3 py-2 text-sm font-semibold transition", pathname === href ? "text-navy" : "text-slate-500 hover:text-navy")}>
              {label}
              <span className={cx("bg-thermal absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full transition-opacity", pathname === href ? "opacity-100" : "opacity-0")} />
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <LanguageSwitch />
          <Link href={space} className="hidden sm:block"><Button variant="outline" size="sm">{spaceLabel}</Button></Link>
          <Link href="/request-quote" className="hidden md:block"><Button variant="accent" size="sm">{t("nav.requestQuote")}</Button></Link>
          <button className="rounded-lg p-2 lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="menu">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-slate-100 bg-white px-4 py-3 lg:hidden">
          {[...links, ["/request-quote", t("nav.requestQuote")], [space, spaceLabel]].map(([href, label]) => (
            <Link key={href + label} href={href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-surface">{label}</Link>
          ))}
        </nav>
      )}
    </header>
  );
}

export function PublicFooter() {
  const { t } = useI18n();
  const c = usePublicCompany();
  return (
    <footer className="relative overflow-hidden bg-navy text-white/65">
      <ThermalBar />
      <div className="blueprint pointer-events-none absolute inset-0 mask-fade" />
      <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.3fr_1fr_1fr]">
        <div>
          <Logo light />
          <p className="mt-5 max-w-xs text-sm leading-relaxed">{t("common.tagline")}</p>
          <div className="mt-5 inline-flex items-center gap-3 rounded-full bg-white/5 px-4 py-2 text-xs ring-1 ring-white/10">
            <Snowflake className="h-4 w-4 text-ice" /><span className="bg-thermal h-1 w-10 rounded-full" /><Flame className="h-4 w-4 text-accent" />
            <span className="ms-1 text-white/70">{t("public.hours")}</span>
          </div>
        </div>
        <div>
          <p className="eyebrow mb-4 text-white">{t("nav.services")}</p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">{SERVICES.map((s) => <li key={s.code}><Link href="/services" className="transition hover:text-white">{t(`services.${s.code}`)}</Link></li>)}</ul>
        </div>
        <div>
          <p className="eyebrow mb-4 text-white">{t("nav.contact")}</p>
          <ul className="space-y-3 text-sm">
            {c?.phone && <li className="flex items-center gap-3"><Phone className="h-4 w-4 text-ice" /><a dir="ltr" href={`tel:${c.phone}`} className="hover:text-white">{c.phone}</a></li>}
            {c?.email && <li className="flex items-center gap-3"><Mail className="h-4 w-4 text-ice" /><a href={`mailto:${c.email}`} className="hover:text-white">{c.email}</a></li>}
            {c?.address && <li className="flex items-center gap-3"><MapPin className="h-4 w-4 text-accent" />{c.address}{c.city ? `, ${c.city}` : ""}</li>}
          </ul>
          <Link href="/request-quote" className="mt-6 inline-block"><Button variant="accent" size="sm">{t("nav.requestQuote")}</Button></Link>
        </div>
      </div>
      <div className="relative border-t border-white/10 py-5 text-center text-xs text-white/45">© {new Date().getFullYear()} F2A TRAVAUX — {t("public.rights")}</div>
    </footer>
  );
}

export function PageHero({ title, text }: { title: string; text?: string }) {
  return (
    <section className="relative overflow-hidden bg-navy text-white">
      <div className="blueprint pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute -start-24 top-0 h-72 w-72 rounded-full bg-ice opacity-20 blur-3xl" />
      <div className="pointer-events-none absolute -end-24 bottom-0 h-72 w-72 rounded-full bg-accent opacity-25 blur-3xl" />
      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <span className="eyebrow text-ice">F2A TRAVAUX</span>
        <h1 className="mt-3 max-w-3xl text-3xl font-extrabold sm:text-5xl">{title}</h1>
        {text && <p className="mt-4 max-w-2xl text-lg text-white/65">{text}</p>}
      </div>
      <ThermalBar />
    </section>
  );
}

export function CtaBand() {
  const { t } = useI18n();
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl bg-navy p-8 text-white shadow-lift sm:p-12">
        <div className="blueprint pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -start-16 -top-16 h-64 w-64 rounded-full bg-ice opacity-25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -end-10 h-72 w-72 rounded-full bg-accent opacity-35 blur-3xl" />
        <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="flex items-start gap-5">
            <div className="hidden flex-col items-center gap-1 sm:flex">
              <Snowflake className="h-6 w-6 text-ice" /><span className="h-10 w-1 rounded-full bg-gradient-to-b from-ice via-flame-yellow to-flame-red" /><Flame className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold sm:text-3xl">{t("public.readyTitle")}</h2>
              <p className="mt-2 max-w-xl text-white/65">{t("public.readyText")}</p>
            </div>
          </div>
          <Link href="/request-quote"><Button variant="accent" size="lg">{t("public.ctaQuote")}</Button></Link>
        </div>
      </div>
    </section>
  );
}

export const PROJECTS = [
  { key: "project1", service: "heating" },
  { key: "project2", service: "ac" },
  { key: "project3", service: "fluids" },
  { key: "project4", service: "ventilation" },
  { key: "project5", service: "plumbing" },
  { key: "project6", service: "maintenance" },
];

// Project visual without photos: blueprint panel with a glow in the service's temperature
export function ProjectCard({ p, index = 0 }: { p: (typeof PROJECTS)[number]; index?: number }) {
  const { t } = useI18n();
  const svc = SERVICES.find((s) => s.code === p.service);
  const hot = svc?.tone === "hot";
  return (
    <article className="group overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/80 transition hover:-translate-y-1 hover:shadow-lift">
      <div className="relative flex h-48 items-center justify-center overflow-hidden bg-navy text-white">
        <div className="blueprint pointer-events-none absolute inset-0" />
        <div className={cx("pointer-events-none absolute h-40 w-40 rounded-full blur-3xl transition group-hover:scale-125", hot ? "bg-accent opacity-50" : "bg-ice opacity-40")} />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur [&_svg]:h-9 [&_svg]:w-9">
          <span className={hot ? "text-flame-yellow" : "text-ice"}>{svc?.icon}</span>
        </div>
        <span className="absolute end-4 top-4 font-mono text-xs text-white/40">REF·{String(index + 1).padStart(3, "0")}</span>
        <span className="absolute bottom-4 start-4 rounded-full bg-white px-3 py-1 text-xs font-bold text-navy">{t(`services.${p.service}`)}</span>
      </div>
      <div className={cx("h-1", hot ? "bg-gradient-to-r from-flame-yellow to-flame-red" : "bg-gradient-to-r from-brand to-ice")} />
      <div className="p-5"><h3 className="font-bold leading-snug text-navy">{t(`public.${p.key}`)}</h3></div>
    </article>
  );
}
