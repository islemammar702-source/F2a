"use client";

import { forwardRef, useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "accent" | "danger" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest },
  ref,
) {
  const v = {
    primary: "bg-brand text-white hover:bg-brand-700 shadow-sm",
    secondary: "bg-brand-50 text-brand hover:bg-brand-100",
    accent: "bg-accent text-navy hover:bg-accent-600 hover:text-white shadow-sm",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-slate-600 hover:bg-slate-100",
    outline: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  }[variant];
  const s = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base" }[size];
  return (
    <button
      ref={ref}
      className={cx("inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60", v, s, className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function Field({ label, error, hint, children, required, className }: { label?: ReactNode; error?: string; hint?: ReactNode; children: ReactNode; required?: boolean; className?: string }) {
  return (
    <label className={cx("block", className)}>
      {label && (
        <span className="mb-1 block text-sm font-medium text-slate-700">
          {label} {required && <span className="text-red-500">*</span>}
        </span>
      )}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

const inputBase = "w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-slate-100";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cx(inputBase, "h-10", className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cx(inputBase, "min-h-[80px] py-2", className)} {...p} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...p }, ref) {
  return (
    <select ref={ref} className={cx(inputBase, "h-10 pe-8", className)} {...p}>
      {children}
    </select>
  );
});

export function Checkbox({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cx("inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700", disabled && "opacity-60")}>
      <input type="checkbox" className="h-4 w-4 rounded border-slate-300 accent-brand" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Card({ children, className, title, actions, padded = true }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode; padded?: boolean }) {
  return (
    <section className={cx("rounded-2xl border border-slate-200/70 bg-white shadow-card", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-sm font-bold text-navy">{title}</h2>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back}
        <h1 className="text-2xl font-extrabold tracking-tight text-navy">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const BADGE: Record<string, string> = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-brand-50 text-brand ring-brand-100",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  orange: "bg-accent-50 text-accent-600 ring-accent-100",
  red: "bg-red-50 text-red-700 ring-red-200",
  navy: "bg-navy text-white ring-navy",
};

export function Badge({ color = "gray", children }: { color?: keyof typeof BADGE | string; children: ReactNode }) {
  return <span className={cx("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", BADGE[color] ?? BADGE.gray)}>{children}</span>;
}

const STATUS_COLORS: Record<string, Record<string, string>> = {
  quote: { draft: "gray", sent: "blue", accepted: "green", refused: "red", expired: "orange" },
  invoice: { unpaid: "gray", partial: "orange", paid: "green", overdue: "red", cancelled: "navy" },
  payment: { valid: "green", cancelled: "red" },
  request: { new: "orange", in_progress: "blue", quoted: "green", closed: "gray" },
};

export function StatusBadge({ kind, status }: { kind: "quote" | "invoice" | "payment" | "request"; status: string }) {
  const { t } = useI18n();
  return <Badge color={STATUS_COLORS[kind]?.[status]}>{t(`status.${kind}.${status}`)}</Badge>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("h-6 w-6 animate-spin text-brand", className)} />;
}

export function Loading() {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
      <Spinner /> {t("common.loading")}
    </div>
  );
}

export function Empty({ text, icon, action }: { text?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center text-sm text-slate-500">
      {icon && <div className="text-slate-300">{icon}</div>}
      <p>{text ?? t("common.noData")}</p>
      {action}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, size = "md" }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" | "xl" }) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={id} className={cx("flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl", w)}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 id={id} className="text-base font-bold text-navy">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, text, confirmLabel, danger, loading, children }: { open: boolean; onClose: () => void; onConfirm: () => void; title: ReactNode; text?: ReactNode; confirmLabel?: ReactNode; danger?: boolean; loading?: boolean; children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={
      <>
        <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>{confirmLabel ?? t("common.confirm")}</Button>
      </>
    }>
      {text && <p className="text-sm text-slate-600">{text}</p>}
      {children}
    </Modal>
  );
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const { t, dir } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const Prev = dir === "rtl" ? ChevronRight : ChevronLeft;
  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
      <span>{total} {t("common.results")}</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label={t("common.previous")}><Prev className="h-4 w-4" /></Button>
        <span>{t("common.page")} {page} {t("common.of")} {pages}</span>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label={t("common.next")}><Next className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-surface/70 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
            {head.map((h, i) => <th key={i} className="whitespace-nowrap px-4 py-3 text-start">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
      {empty && <Empty />}
    </div>
  );
}

export function Td({ children, className, dir }: { children?: ReactNode; className?: string; dir?: "ltr" | "rtl" }) {
  return <td dir={dir} className={cx("px-4 py-3 align-middle", className)}>{children}</td>;
}

export function StatCard({ label, value, icon, tone = "blue", hint }: { label: ReactNode; value: ReactNode; icon?: ReactNode; tone?: "blue" | "orange" | "green" | "red" | "navy"; hint?: ReactNode }) {
  const tones = { blue: "bg-brand-50 text-brand", orange: "bg-accent-50 text-accent-600", green: "bg-emerald-50 text-emerald-600", red: "bg-red-50 text-red-600", navy: "bg-navy text-white" };
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-card">
      {icon && <div className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", tones[tone])}>{icon}</div>}
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-1 truncate text-xl font-extrabold text-navy tabular-nums">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
      {tabs.map((tb) => (
        <button key={tb.id} onClick={() => onChange(tb.id)} className={cx("whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition", value === tb.id ? "bg-white text-brand shadow-sm" : "text-slate-500 hover:text-navy")}>
          {tb.label}
        </button>
      ))}
    </div>
  );
}
