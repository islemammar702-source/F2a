"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bell, BarChart3, ClipboardList, CreditCard, FileSignature, FileText, Home, Inbox, LayoutDashboard, LogOut, Menu,
  Receipt, Search, Settings, Shield, User as UserIcon, Users, X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import { formatDateTime } from "@/lib/format";
import type { Notification } from "@/lib/types";
import { Logo } from "./Logo";
import LanguageSwitch from "./LanguageSwitch";
import { cx, Loading } from "./ui";

type NavItem = { href: string; label: string; icon: ReactNode; perm?: string };

function useNav(isClient: boolean): { section: string; items: NavItem[] }[] {
  const { t } = useI18n();
  const i = "h-[18px] w-[18px]";
  if (isClient) {
    return [{
      section: "", items: [
        { href: "/portal", label: t("nav.portalHome"), icon: <Home className={i} /> },
        { href: "/portal/quotes", label: t("nav.myQuotes"), icon: <FileSignature className={i} /> },
        { href: "/portal/invoices", label: t("nav.myInvoices"), icon: <Receipt className={i} /> },
        { href: "/portal/payments", label: t("nav.myPayments"), icon: <CreditCard className={i} /> },
        { href: "/portal/profile", label: t("nav.myProfile"), icon: <UserIcon className={i} /> },
      ],
    }];
  }
  return [
    { section: "", items: [{ href: "/dashboard", label: t("nav.dashboard"), icon: <LayoutDashboard className={i} />, perm: "dashboard.view" }] },
    {
      section: t("nav.management"), items: [
        { href: "/clients", label: t("nav.clients"), icon: <Users className={i} />, perm: "clients.view" },
        { href: "/requests", label: t("nav.requests"), icon: <Inbox className={i} />, perm: "requests.view" },
        { href: "/quotes", label: t("nav.quotes"), icon: <FileSignature className={i} />, perm: "quotes.view" },
        { href: "/invoices", label: t("nav.invoices"), icon: <FileText className={i} />, perm: "invoices.view" },
      ],
    },
    {
      section: t("nav.finance"), items: [
        { href: "/payments", label: t("nav.payments"), icon: <CreditCard className={i} />, perm: "payments.view" },
        { href: "/reports", label: t("nav.reports"), icon: <BarChart3 className={i} />, perm: "reports.view" },
      ],
    },
    {
      section: t("nav.administration"), items: [
        { href: "/users", label: t("nav.users"), icon: <ClipboardList className={i} />, perm: "users.view" },
        { href: "/roles", label: t("nav.roles"), icon: <Shield className={i} />, perm: "roles.manage" },
        { href: "/settings", label: t("nav.settings"), icon: <Settings className={i} />, perm: "settings.manage" },
      ],
    },
  ];
}

function Sidebar({ open, onClose, isClient }: { open: boolean; onClose: () => void; isClient: boolean }) {
  const pathname = usePathname();
  const { can } = useAuth();
  const { t } = useI18n();
  const nav = useNav(isClient);
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-navy/40 lg:hidden" onClick={onClose} />}
      <aside className={cx(
        "fixed inset-y-0 start-0 z-40 flex w-64 flex-col bg-navy text-white transition-transform lg:translate-x-0",
        open ? "translate-x-0" : "ltr:-translate-x-full rtl:translate-x-full",
      )}>
        <div className="flex h-16 items-center justify-between px-5">
          <Link href={isClient ? "/portal" : "/dashboard"} onClick={onClose}><Logo light subtitle="MANAGER" /></Link>
          <button className="rounded-lg p-1 text-white/70 hover:bg-white/10 lg:hidden" onClick={onClose} aria-label="close"><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {nav.map((group, gi) => {
            const items = group.items.filter((it) => !it.perm || can(it.perm));
            if (!items.length) return null;
            return (
              <div key={gi} className="mb-4">
                {group.section && <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-white/40">{group.section}</p>}
                {items.map((it) => {
                  const active = pathname === it.href || (it.href !== "/portal" && pathname.startsWith(it.href + "/"));
                  return (
                    <Link key={it.href} href={it.href} onClick={onClose} className={cx(
                      "mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                      active ? "bg-brand text-white shadow-inner" : "text-white/70 hover:bg-white/5 hover:text-white",
                    )}>
                      <span className={active ? "text-accent" : ""}>{it.icon}</span>
                      {it.label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-4">
          <Link href="/" className="text-xs text-white/50 hover:text-white">← {t("nav.backToSite")}</Link>
        </div>
      </aside>
    </>
  );
}

function GlobalSearch() {
  const { t } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Record<string, { id: string; label: string; sub: string }[]> | null>(null);
  const dq = useDebounced(q, 250);
  useEffect(() => {
    if (dq.trim().length < 2) {
      setRes(null);
      return;
    }
    api<typeof res>("/search", { query: { q: dq } }).then(setRes).catch(() => setRes(null));
  }, [dq]);
  const go = (href: string) => {
    setQ("");
    setRes(null);
    router.push(href);
  };
  const groups: [string, string, string][] = [["clients", "/clients/", t("nav.clients")], ["quotes", "/quotes/", t("nav.quotes")], ["invoices", "/invoices/", t("nav.invoices")]];
  const any = res && groups.some(([k]) => res[k]?.length);
  return (
    <div className="relative hidden w-full max-w-md md:block">
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.searchPlaceholder")} aria-label={t("common.search")}
        className="h-10 w-full rounded-xl border border-slate-200 bg-surface ps-9 pe-3 text-sm focus:border-brand focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand/20" />
      {res && (
        <div className="absolute inset-x-0 top-12 z-50 max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          {!any && <p className="px-3 py-4 text-center text-sm text-slate-500">{t("common.noData")}</p>}
          {groups.map(([k, base, label]) => res[k]?.length ? (
            <div key={k} className="mb-1">
              <p className="px-3 py-1 text-[11px] font-bold uppercase text-slate-400">{label}</p>
              {res[k].map((r) => (
                <button key={r.id} onClick={() => go(base + r.id)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start text-sm hover:bg-surface">
                  <span className="font-semibold text-navy">{r.label}</span>
                  <span className="truncate text-xs text-slate-500">{r.sub}</span>
                </button>
              ))}
            </div>
          ) : null)}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ items: Notification[]; unread: number }>({ items: [], unread: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const load = () => api<typeof data>("/notifications").then(setData).catch(() => {});
  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const markAll = async () => {
    await api("/notifications/read", { method: "POST" });
    load();
  };
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label={t("common.notifications")}>
        <Bell className="h-5 w-5" />
        {data.unread > 0 && <span className="absolute -top-0.5 end-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-navy">{data.unread}</span>}
      </button>
      {open && (
        <div className="absolute end-0 top-12 z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-navy">{t("common.notifications")}</p>
            {data.unread > 0 && <button onClick={markAll} className="text-xs font-semibold text-brand hover:underline">{t("common.markAllRead")}</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {data.items.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">{t("common.noNotifications")}</p>}
            {data.items.map((n) => (
              <button key={n.id} onClick={async () => {
                setOpen(false);
                if (!n.is_read) await api("/notifications/read", { method: "POST", body: [n.id] }).catch(() => {});
                load();
                if (n.link) router.push(n.link);
              }} className={cx("flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-start hover:bg-surface", !n.is_read && "bg-brand-50/50")}>
                <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.is_read ? "bg-slate-200" : "bg-accent")} />
                <span className="min-w-0">
                  <span className="block text-sm text-navy">{t(`notif.${n.type}`, n.data)}</span>
                  <span className="text-xs text-slate-400">{formatDateTime(n.created_at, lang)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout, isClient } = useAuth();
  const { t, lang } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const initials = user.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-xl p-1 pe-2 hover:bg-slate-100">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{initials}</span>
        <span className="hidden text-start leading-tight sm:block">
          <span className="block text-sm font-semibold text-navy">{user.full_name}</span>
          <span className="block text-xs text-slate-500">{lang === "ar" ? user.role.name_ar : user.role.name_fr}</span>
        </span>
      </button>
      {open && (
        <div className="absolute end-0 top-12 z-50 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl" onMouseLeave={() => setOpen(false)}>
          <Link href={isClient ? "/portal/profile" : "/profile"} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface"><UserIcon className="h-4 w-4" />{t("common.profile")}</Link>
          <button onClick={async () => { await logout(); router.replace("/login"); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" />{t("common.logout")}</button>
        </div>
      )}
    </div>
  );
}

/** Authenticated layout: redirects to /login when no session, and keeps clients/staff in their own space. */
export default function AppShell({ children, area }: { children: ReactNode; area: "staff" | "client" }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (area === "staff" && user.role.is_client_role) router.replace("/portal");
    else if (area === "client" && !user.role.is_client_role) router.replace("/dashboard");
  }, [user, loading, area, router, pathname]);

  if (loading || !user || (area === "staff") === user.role.is_client_role) {
    return <div className="flex min-h-screen items-center justify-center"><Loading /></div>;
  }
  return (
    <div className="min-h-screen">
      <Sidebar open={open} onClose={() => setOpen(false)} isClient={area === "client"} />
      <div className="lg:ps-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/70 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="menu"><Menu className="h-5 w-5" /></button>
          {area === "staff" ? <GlobalSearch /> : <div className="flex-1" />}
          <div className="ms-auto flex items-center gap-1">
            <LanguageSwitch />
            <Notifications />
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

export function RequirePermission({ perm, children }: { perm: string | string[]; children: ReactNode }) {
  const { can } = useAuth();
  const { t } = useI18n();
  const perms = Array.isArray(perm) ? perm : [perm];
  if (!can(...perms)) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-card">
        <Shield className="mx-auto mb-3 h-10 w-10 text-accent" />
        <h1 className="text-lg font-bold text-navy">{t("common.accessDenied")}</h1>
        <p className="mt-2 text-sm text-slate-500">{t("common.accessDeniedText")}</p>
      </div>
    );
  }
  return <>{children}</>;
}
