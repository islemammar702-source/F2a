"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Droplets, Fan, Flame, Gauge, LifeBuoy, Mail, MapPin, Menu, Phone, ShowerHead, Snowflake, Wrench, X } from "lucide-react";
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

export const SERVICES: { code: string; icon: ReactNode }[] = [
  { code: "heating", icon: <Flame className="h-6 w-6" /> },
  { code: "ventilation", icon: <Fan className="h-6 w-6" /> },
  { code: "ac", icon: <Snowflake className="h-6 w-6" /> },
  { code: "plumbing", icon: <Droplets className="h-6 w-6" /> },
  { code: "sanitary", icon: <ShowerHead className="h-6 w-6" /> },
  { code: "fluids", icon: <Gauge className="h-6 w-6" /> },
  { code: "maintenance", icon: <Wrench className="h-6 w-6" /> },
  { code: "repair", icon: <LifeBuoy className="h-6 w-6" /> },
];

export function PublicHeader() {
  const { t } = useI18n();
  const { user } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = [["/", t("nav.home")], ["/about", t("nav.about")], ["/services", t("nav.services")], ["/projects", t("nav.projects")], ["/contact", t("nav.contact")]];
  const space = user ? (user.role.is_client_role ? "/portal" : "/dashboard") : "/login";
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/"><Logo /></Link>
        <nav className="hidden items-center gap-1 lg:flex">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className={cx("rounded-lg px-3 py-2 text-sm font-semibold transition", pathname === href ? "text-brand" : "text-slate-600 hover:text-brand")}>{label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <LanguageSwitch />
          <Link href={space} className="hidden sm:block"><Button variant="outline" size="sm">{user ? t("nav.clientSpace") : t("nav.login")}</Button></Link>
          <Link href="/request-quote" className="hidden md:block"><Button variant="accent" size="sm">{t("nav.requestQuote")}</Button></Link>
          <button className="rounded-lg p-2 lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="menu">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-slate-100 bg-white px-4 py-3 lg:hidden">
          {[...links, ["/request-quote", t("nav.requestQuote")], [space, user ? t("nav.clientSpace") : t("nav.login")]].map(([href, label]) => (
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
    <footer className="bg-navy text-white/70">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3">
        <div>
          <Logo light />
          <p className="mt-4 text-sm">{t("common.tagline")}</p>
          <p className="mt-2 text-sm">{t("public.hours")}</p>
        </div>
        <div>
          <p className="mb-3 font-bold text-white">{t("nav.services")}</p>
          <ul className="grid grid-cols-2 gap-1 text-sm">{SERVICES.map((s) => <li key={s.code}><Link href="/services" className="hover:text-accent">{t(`services.${s.code}`)}</Link></li>)}</ul>
        </div>
        <div>
          <p className="mb-3 font-bold text-white">{t("nav.contact")}</p>
          <ul className="space-y-2 text-sm">
            {c?.phone && <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-accent" /><a dir="ltr" href={`tel:${c.phone}`}>{c.phone}</a></li>}
            {c?.email && <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-accent" /><a href={`mailto:${c.email}`}>{c.email}</a></li>}
            {c?.address && <li className="flex items-center gap-2"><MapPin className="h-4 w-4 text-accent" />{c.address}{c.city ? `, ${c.city}` : ""}</li>}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs">© {new Date().getFullYear()} F2A TRAVAUX — {t("public.rights")}</div>
    </footer>
  );
}

export function PageHero({ title, text }: { title: string; text?: string }) {
  return (
    <section className="relative overflow-hidden bg-navy py-16 text-white">
      <div className="absolute -end-20 -top-20 h-72 w-72 rounded-full bg-brand opacity-70 blur-3xl" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-3 h-1 w-14 rounded bg-accent" />
        <h1 className="text-3xl font-extrabold sm:text-4xl">{title}</h1>
        {text && <p className="mt-3 max-w-2xl text-white/70">{text}</p>}
      </div>
    </section>
  );
}

export function CtaBand() {
  const { t } = useI18n();
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-gradient-to-br from-brand to-navy p-8 text-white shadow-card sm:p-12 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-extrabold">{t("public.readyTitle")}</h2>
          <p className="mt-2 text-white/70">{t("public.readyText")}</p>
        </div>
        <Link href="/request-quote"><Button variant="accent" size="lg">{t("public.ctaQuote")}</Button></Link>
      </div>
    </section>
  );
}

export const PROJECTS = [
  { key: "project1", service: "heating", gradient: "from-orange-400 to-red-500" },
  { key: "project2", service: "ac", gradient: "from-sky-400 to-brand" },
  { key: "project3", service: "fluids", gradient: "from-emerald-400 to-teal-600" },
  { key: "project4", service: "ventilation", gradient: "from-slate-400 to-navy" },
  { key: "project5", service: "plumbing", gradient: "from-cyan-400 to-blue-700" },
  { key: "project6", service: "maintenance", gradient: "from-amber-400 to-accent-600" },
];

export function ProjectCard({ p }: { p: (typeof PROJECTS)[number] }) {
  const { t } = useI18n();
  const icon = SERVICES.find((s) => s.code === p.service)?.icon;
  return (
    <article className="group overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-slate-200/70">
      <div className={`relative flex h-44 items-center justify-center bg-gradient-to-br ${p.gradient} text-white`}>
        <div className="scale-[2.2] opacity-90 transition group-hover:scale-[2.5]">{icon}</div>
        <span className="absolute bottom-3 start-3 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-navy">{t(`services.${p.service}`)}</span>
      </div>
      <div className="p-5"><h3 className="font-bold text-navy">{t(`public.${p.key}`)}</h3></div>
    </article>
  );
}
