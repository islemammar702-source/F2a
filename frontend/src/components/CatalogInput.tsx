"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen } from "lucide-react";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { CatalogItem } from "@/lib/types";
import { Input, cx } from "./ui";

/**
 * Designation field with suggestions from the material catalogue:
 * type 2+ letters → matching materials with their price; choosing one fills the line (price, unit, type, VAT).
 * Free text stays possible for anything not in the catalogue.
 */
export default function CatalogInput({ value, onChange, onPick, disabled, placeholder }: {
  value: string; onChange: (v: string) => void; onPick: (item: CatalogItem) => void; disabled?: boolean; placeholder?: string;
}) {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const typed = useRef(false); // only search after the user typed (not when the value is filled by a scan)
  const seq = useRef(0);

  useEffect(() => {
    const q = value.trim();
    if (!typed.current || q.length < 2) {
      setItems([]);
      return;
    }
    const n = ++seq.current;
    const timer = setTimeout(() => {
      api<CatalogItem[]>("/catalog", { query: { q, limit: 8 } })
        .then((r) => { if (n === seq.current) { setItems(r); setActive(0); setOpen(true); } })
        .catch(() => setItems([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [value]);

  const pick = (it: CatalogItem) => {
    typed.current = false;
    setOpen(false);
    setItems([]);
    onPick(it);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || !items.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + items.length) % items.length); }
    else if (e.key === "Enter") { e.preventDefault(); pick(items[active]); }
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div className="relative">
      <Input placeholder={placeholder} value={value} disabled={disabled} autoComplete="off"
        onChange={(e) => { typed.current = true; onChange(e.target.value); }}
        onKeyDown={onKey} onFocus={() => items.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        role="combobox" aria-expanded={open} aria-autocomplete="list" />
      {open && items.length > 0 && (
        <ul role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-xl bg-white py-1 text-sm shadow-lift ring-1 ring-slate-200">
          <li className="flex items-center gap-1.5 px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <BookOpen className="h-3.5 w-3.5" />{t("catalog.suggestions")}
          </li>
          {items.map((it, i) => (
            <li key={it.id} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(it); }} onMouseEnter={() => setActive(i)}
              className={cx("flex cursor-pointer items-center gap-3 px-3 py-2", i === active ? "bg-ice-50" : "")}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-navy">{it.designation}</span>
                <span className="block truncate text-xs text-slate-400">{it.reference}{it.category ? ` · ${it.category}` : ""}</span>
              </span>
              <span className="shrink-0 text-end">
                <span className="block font-semibold tabular-nums text-navy">{formatMoney(it.unit_price_ht, lang)}</span>
                <span className="block text-xs text-slate-400">/ {t(`units.${it.unit}`)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
