"use client";

import { useEffect, useMemo, useState } from "react";
import { GripVertical, Hammer, Package, Plus, Trash2, UserPlus, Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { addDaysISO, documentTotals, formatMoney, lineTotals, todayISO, toNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useCompanySettings } from "@/lib/useSettings";
import type { Client, Line, Page } from "@/lib/types";
import ClientFormModal from "./ClientForm";
import { useToast } from "./Toast";
import { Button, Card, Checkbox, Field, Input, Select, Textarea, cx } from "./ui";

export type EditorValue = {
  client_id: string;
  title: string;
  site_address: string;
  issue_date: string;
  second_date: string; // validity_date (quote) | due_date (invoice)
  payment_terms: string;
  special_conditions: string;
  notes: string;
  language: "fr" | "ar";
  apply_stamp_duty: boolean;
  items: Line[];
};

const UNITS = ["u", "ml", "m2", "m3", "kg", "h", "j", "forfait", "lot"];

export function emptyLine(type: Line["item_type"], tva: number): Line {
  const unit = type === "labor" ? "j" : type === "service" ? "forfait" : "u";
  return { item_type: type, designation: "", description: "", quantity: "1", unit, unit_price_ht: "", discount: "0", tva_rate: String(tva) };
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Card title={<span className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-navy">{n}</span>{title}</span>}>
      {children}
    </Card>
  );
}

export default function DocumentEditor({
  kind, initial, onSubmit, saving, lockClientAndItems = false,
}: {
  kind: "quote" | "invoice";
  initial?: Partial<EditorValue>;
  onSubmit: (v: EditorValue) => void;
  saving?: boolean;
  lockClientAndItems?: boolean;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const settings = useCompanySettings();
  const defaultTva = toNumber(settings?.default_tax_rate ?? 19);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientModal, setClientModal] = useState(false);
  const [v, setV] = useState<EditorValue>(() => ({
    client_id: "", title: "", site_address: "", issue_date: todayISO(), second_date: "", payment_terms: "",
    special_conditions: "", notes: "", language: lang, apply_stamp_duty: true, items: [emptyLine("material", 19)], ...initial,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    api<Page<Client>>("/clients", { query: { page_size: 200 } }).then((p) => setClients(p.items)).catch(toast.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply defaults from company settings once loaded (new documents only)
  useEffect(() => {
    if (!settings || initial?.second_date) return;
    const days = kind === "quote" ? settings.quote_validity_days : settings.invoice_due_days;
    setV((cur) => ({
      ...cur,
      second_date: cur.second_date || addDaysISO(cur.issue_date, days),
      apply_stamp_duty: initial?.apply_stamp_duty ?? settings.apply_stamp_duty,
      items: initial?.items ? cur.items : cur.items.map((l) => (l.designation ? l : { ...l, tva_rate: String(toNumber(settings.default_tax_rate)) })),
    }));
  }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof EditorValue>(k: K, val: EditorValue[K]) => setV((cur) => ({ ...cur, [k]: val }));
  const setLine = (i: number, patch: Partial<Line>) => setV((cur) => ({ ...cur, items: cur.items.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const addLine = (type: Line["item_type"]) => setV((cur) => ({ ...cur, items: [...cur.items, emptyLine(type, defaultTva)] }));
  const removeLine = (i: number) => setV((cur) => ({ ...cur, items: cur.items.filter((_, j) => j !== i) }));
  const move = (i: number, d: -1 | 1) => setV((cur) => {
    const items = [...cur.items];
    const j = i + d;
    if (j < 0 || j >= items.length) return cur;
    [items[i], items[j]] = [items[j], items[i]];
    return { ...cur, items };
  });

  const totals = useMemo(() => documentTotals(v.items), [v.items]);
  const stamp = kind === "invoice" && v.apply_stamp_duty ? toNumber(settings?.stamp_duty ?? 1) : 0;
  const rates = (settings?.tax_rates ?? [0, 7, 13, 19]).map(toNumber);
  const selectedClient = clients.find((c) => c.id === v.client_id);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!v.client_id) errs.client_id = t("common.required");
    if (v.title.trim().length < 2) errs.title = t("common.required");
    if (!v.items.length) errs.items = t("lines.atLeastOne");
    v.items.forEach((l, i) => {
      if (!l.designation.trim()) errs[`d${i}`] = t("common.required");
      if (toNumber(l.quantity) <= 0) errs[`q${i}`] = t("errors.quantity_must_be_positive");
      if (lineTotals(l).ht < 0) errs[`r${i}`] = t("errors.discount_exceeds_amount");
    });
    if (v.second_date && v.second_date < v.issue_date) errs.second_date = t(kind === "quote" ? "errors.validity_before_issue" : "errors.due_before_issue");
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error(new Error("validation"));
      return;
    }
    onSubmit(v);
  };

  const typeIcon = { service: <Wrench className="h-4 w-4" />, material: <Package className="h-4 w-4" />, labor: <Hammer className="h-4 w-4" /> };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Step n={1} title={t("quotes.step1")}>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t("quotes.client")} required error={errors.client_id} className="min-w-[260px] flex-1">
            <Select value={v.client_id} disabled={lockClientAndItems} onChange={(e) => {
              const c = clients.find((x) => x.id === e.target.value);
              setV((cur) => ({ ...cur, client_id: e.target.value, site_address: cur.site_address || [c?.address, c?.city].filter(Boolean).join(", ") }));
            }}>
              <option value="">{t("quotes.selectClient")}</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` – ${c.city}` : ""}</option>)}
            </Select>
          </Field>
          {!lockClientAndItems && <Button type="button" variant="outline" icon={<UserPlus className="h-4 w-4" />} onClick={() => setClientModal(true)}>{t("quotes.createClient")}</Button>}
        </div>
        {selectedClient && (
          <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-xs text-slate-600">
            {[selectedClient.phone, selectedClient.email, selectedClient.tax_id && `${t("clients.taxId")}: ${selectedClient.tax_id}`].filter(Boolean).join(" · ")}
          </p>
        )}
      </Step>

      <Step n={2} title={t("quotes.step2")}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={kind === "quote" ? t("quotes.object") : t("invoices.object")} required error={errors.title} className="md:col-span-2">
            <Input value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="Ex. Installation chauffage central – villa" />
          </Field>
          <Field label={t("quotes.siteAddress")}><Input value={v.site_address} onChange={(e) => set("site_address", e.target.value)} /></Field>
          <Field label={t("quotes.pdfLanguage")}>
            <Select value={v.language} onChange={(e) => set("language", e.target.value as "fr" | "ar")}>
              <option value="fr">Français</option><option value="ar">العربية</option>
            </Select>
          </Field>
          <Field label={kind === "quote" ? t("quotes.issueDate") : t("invoices.issueDate")}>
            <Input type="date" value={v.issue_date} disabled={lockClientAndItems} onChange={(e) => set("issue_date", e.target.value)} />
          </Field>
          <Field label={kind === "quote" ? t("quotes.validityDate") : t("invoices.dueDate")} error={errors.second_date}>
            <Input type="date" value={v.second_date} min={v.issue_date} onChange={(e) => set("second_date", e.target.value)} />
          </Field>
        </div>
      </Step>

      <Step n={3} title={t("quotes.step3")}>
        {lockClientAndItems && <p className="mb-3 rounded-lg bg-accent-50 px-3 py-2 text-sm text-accent-600">{t("invoices.restrictedEdit")}</p>}
        {errors.items && <p className="mb-3 text-sm text-red-600">{errors.items}</p>}
        <div className="space-y-3">
          {v.items.map((l, i) => {
            const lt = lineTotals(l);
            return (
              <div key={i} className="rounded-xl border border-slate-200 bg-surface/40 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-xs font-bold text-slate-500 ring-1 ring-slate-200">{i + 1}</span>
                    <Select className="h-8 w-auto text-xs" value={l.item_type} disabled={lockClientAndItems} onChange={(e) => setLine(i, { item_type: e.target.value as Line["item_type"] })} aria-label={t("lines.type")}>
                      <option value="service">{t("lines.service")}</option><option value="material">{t("lines.material")}</option><option value="labor">{t("lines.labor")}</option>
                    </Select>
                    <span className="text-slate-400">{typeIcon[l.item_type]}</span>
                  </div>
                  {!lockClientAndItems && (
                    <div className="flex items-center gap-1">
                      <button type="button" className="rounded p-1 text-slate-400 hover:bg-white" onClick={() => move(i, -1)} aria-label="up">▲</button>
                      <button type="button" className="rounded p-1 text-slate-400 hover:bg-white" onClick={() => move(i, 1)} aria-label="down">▼</button>
                      <GripVertical className="h-4 w-4 text-slate-300" />
                      <button type="button" className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" onClick={() => removeLine(i)} aria-label={t("common.remove")}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-12">
                  <Field className="col-span-2 md:col-span-5" error={errors[`d${i}`]}>
                    <Input placeholder={t("lines.designation")} value={l.designation} disabled={lockClientAndItems} onChange={(e) => setLine(i, { designation: e.target.value })} />
                  </Field>
                  <Field className="col-span-2 md:col-span-7">
                    <Input placeholder={`${t("lines.description")} (${t("common.optional")})`} value={l.description ?? ""} disabled={lockClientAndItems} onChange={(e) => setLine(i, { description: e.target.value })} />
                  </Field>
                  <Field label={t("lines.quantity")} className="md:col-span-2" error={errors[`q${i}`]}>
                    <Input type="number" inputMode="decimal" step="0.001" min="0" dir="ltr" value={String(l.quantity)} disabled={lockClientAndItems} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                  </Field>
                  <Field label={t("lines.unit")} className="md:col-span-2">
                    <Select value={l.unit} disabled={lockClientAndItems} onChange={(e) => setLine(i, { unit: e.target.value })}>
                      {UNITS.map((u) => <option key={u} value={u}>{t(`units.${u}`)}</option>)}
                    </Select>
                  </Field>
                  <Field label={`${t("lines.unitPrice")} (DT)`} className="md:col-span-2">
                    <Input type="number" inputMode="decimal" step="0.001" min="0" dir="ltr" value={String(l.unit_price_ht)} disabled={lockClientAndItems} onChange={(e) => setLine(i, { unit_price_ht: e.target.value })} />
                  </Field>
                  <Field label={`${t("lines.discount")} (DT)`} className="md:col-span-2" error={errors[`r${i}`]}>
                    <Input type="number" inputMode="decimal" step="0.001" min="0" dir="ltr" value={String(l.discount)} disabled={lockClientAndItems} onChange={(e) => setLine(i, { discount: e.target.value })} />
                  </Field>
                  <Field label={t("lines.tva")} className="md:col-span-1">
                    <Select value={String(toNumber(l.tva_rate))} disabled={lockClientAndItems} onChange={(e) => setLine(i, { tva_rate: e.target.value })}>
                      {Array.from(new Set([...rates, toNumber(l.tva_rate)])).sort((a, b) => a - b).map((r) => <option key={r} value={String(r)}>{r}</option>)}
                    </Select>
                  </Field>
                  <div className="col-span-2 flex flex-col justify-end text-end md:col-span-3">
                    <span className="text-xs text-slate-500">{t("lines.totalHt")} / {t("lines.totalTtc")}</span>
                    <span className="text-sm font-bold tabular-nums text-navy">{formatMoney(lt.ht, lang)} <span className="font-normal text-slate-400">/</span> {formatMoney(lt.ttc, lang)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {!lockClientAndItems && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => addLine("service")}>{t("lines.addService")}</Button>
            <Button type="button" variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => addLine("material")}>{t("lines.addMaterial")}</Button>
            <Button type="button" variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => addLine("labor")}>{t("lines.addLabor")}</Button>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-400">{t("lines.formula")}</p>
      </Step>

      <Step n={4} title={t("quotes.step4")}>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <Field label={t("quotes.paymentTerms")}>
              <Textarea value={v.payment_terms} placeholder={(lang === "ar" ? settings?.payment_terms_ar : settings?.payment_terms_fr) ?? ""} onChange={(e) => set("payment_terms", e.target.value)} />
            </Field>
            {kind === "quote" && (
              <Field label={t("quotes.specialConditions")}><Textarea value={v.special_conditions} onChange={(e) => set("special_conditions", e.target.value)} /></Field>
            )}
            <Field label={t("quotes.internalNotes")}><Textarea value={v.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
            {kind === "invoice" && !lockClientAndItems && (
              <Checkbox label={`${t("quotes.applyStamp")} (${formatMoney(settings?.stamp_duty ?? 1, lang)})`} checked={v.apply_stamp_duty} onChange={(b) => set("apply_stamp_duty", b)} />
            )}
          </div>
          <div className="rounded-xl bg-surface p-4">
            <dl className="space-y-2 text-sm">
              <Row label={t("lines.subtotal")} value={formatMoney(totals.subtotal, lang)} />
              {totals.discount > 0 && <Row label={t("lines.totalDiscount")} value={`- ${formatMoney(totals.discount, lang)}`} />}
              <Row label={t("lines.netHt")} value={formatMoney(totals.ht, lang)} strong />
              {[...totals.byRate.entries()].sort((a, b) => a[0] - b[0]).map(([rate, amount]) => (
                <Row key={rate} label={t("lines.tvaRate", { rate })} value={formatMoney(amount, lang)} />
              ))}
              <Row label={t("lines.grandTotal")} value={formatMoney(totals.ttc, lang)} strong />
              {kind === "invoice" && stamp > 0 && <Row label={t("lines.stamp")} value={formatMoney(stamp, lang)} />}
              <div className="!mt-3 flex items-center justify-between rounded-lg bg-accent px-3 py-2.5 font-extrabold text-navy">
                <span>{kind === "invoice" ? t("lines.netToPay") : t("lines.grandTotal")}</span>
                <span className="tabular-nums">{formatMoney(totals.ttc + stamp, lang)}</span>
              </div>
            </dl>
            <p className="mt-3 text-xs text-slate-500">{t("lines.serverNote")}</p>
          </div>
        </div>
      </Step>

      <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <Button type="button" variant="outline" onClick={() => history.back()}>{t("common.cancel")}</Button>
        <Button type="submit" variant="accent" loading={saving}>{t("common.save")}</Button>
      </div>
      <ClientFormModal open={clientModal} onClose={() => setClientModal(false)} onSaved={(c) => {
        setClients((cs) => [...cs, c].sort((a, b) => a.name.localeCompare(b.name)));
        set("client_id", c.id);
      }} />
    </form>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cx("flex items-center justify-between gap-3", strong ? "font-bold text-navy" : "text-slate-600")}>
      <dt>{label}</dt><dd className="tabular-nums">{value}</dd>
    </div>
  );
}

export function toPayloadItems(items: Line[]) {
  return items.map((l) => ({
    item_type: l.item_type,
    designation: l.designation.trim(),
    description: l.description?.trim() || null,
    quantity: String(toNumber(l.quantity)),
    unit: l.unit,
    unit_price_ht: String(toNumber(l.unit_price_ht)),
    discount: String(toNumber(l.discount)),
    tva_rate: String(toNumber(l.tva_rate)),
  }));
}
