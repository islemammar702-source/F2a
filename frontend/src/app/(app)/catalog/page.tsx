"use client";

import { useRef, useState } from "react";
import { BookOpen, Download, FileSpreadsheet, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { RequirePermission } from "@/components/AppShell";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, ConfirmDialog, Empty, Field, Input, Loading, Modal, PageHeader, Select, Table, Td } from "@/components/ui";
import { api, downloadFile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatMoney, toNumber } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { CatalogItem } from "@/lib/types";

const UNITS = ["u", "ml", "m2", "m3", "kg", "h", "j", "forfait", "lot"];
const TYPES = ["material", "labor", "service"] as const;
type ImportResult = { created: number; updated: number; errors: { row: number; designation: string; error: string }[] };
const EMPTY = { reference: "", designation: "", unit: "u", unit_price_ht: "", item_type: "material", category: "", tva_rate: "" };

export default function CatalogPage() {
  const { can } = useAuth();
  // visible to people who write quotes / invoices; editing needs catalog.manage
  const allowed = can("catalog.manage") || can("quotes.manage") || can("invoices.manage");
  return allowed ? <Catalog /> : <RequirePermission perm="catalog.manage"><Catalog /></RequirePermission>;
}

function Catalog() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const { can } = useAuth();
  const manage = can("catalog.manage");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const { data, loading, reload } = useApi<CatalogItem[]>("/catalog", { q: dq, limit: 1000 });
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [edit, setEdit] = useState<CatalogItem | "new" | null>(null);
  const [form, setForm] = useState<Record<string, string>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<CatalogItem | null>(null);

  const doImport = async (f?: File | null) => {
    if (!f) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await api<ImportResult>("/catalog/import", { method: "POST", form: fd });
      setResult(r);
      toast.success(t("catalog.imported", { created: r.created, updated: r.updated }));
      reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const openEdit = (it: CatalogItem | "new") => {
    setEdit(it);
    setForm(it === "new" ? EMPTY : {
      reference: it.reference, designation: it.designation, unit: it.unit, unit_price_ht: String(toNumber(it.unit_price_ht)),
      item_type: it.item_type, category: it.category ?? "", tva_rate: it.tva_rate === null ? "" : String(toNumber(it.tva_rate)),
    });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...form, category: form.category || null, tva_rate: form.tva_rate === "" ? null : form.tva_rate, unit_price_ht: form.unit_price_ht || "0" };
      if (edit === "new") await api("/catalog", { method: "POST", body });
      else if (edit) await api(`/catalog/${edit.id}`, { method: "PATCH", body: { ...body, is_active: true } });
      toast.success(t("catalog.saved"));
      setEdit(null);
      reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const set = (k: string) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <PageHeader title={t("catalog.title")} subtitle={t("catalog.subtitle")} actions={manage && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => downloadFile("/catalog/export", "catalogue_materiel_F2A.xlsx").catch(toast.error)}>{t("catalog.export")}</Button>
          <Button variant="outline" loading={importing} icon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>{t("catalog.import")}</Button>
          <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => openEdit("new")}>{t("catalog.new")}</Button>
          <input ref={fileRef} type="file" className="hidden" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => doImport(e.target.files?.[0])} />
        </div>
      )} />

      {result && (
        <div className="mb-6 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
          <p className="flex items-center gap-2 font-semibold"><FileSpreadsheet className="h-4 w-4" />{t("catalog.imported", { created: result.created, updated: result.updated })}</p>
          {result.errors.length > 0 && (
            <ul className="mt-2 list-disc ps-6 text-amber-800">
              {result.errors.map((er) => <li key={er.row}>{t("catalog.rowError", { row: er.row, name: er.designation })} – {t(`catalog.err_${er.error}`)}</li>)}
            </ul>
          )}
        </div>
      )}

      <Card padded={false}>
        <div className="border-b border-slate-100 p-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="ps-9" placeholder={t("catalog.search")} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {loading && !data ? <Loading /> : data && data.length === 0 ? (
          <Empty icon={<BookOpen className="h-10 w-10" />} text={t("catalog.empty")} />
        ) : data && (
          <Table head={[t("catalog.reference"), t("lines.designation"), t("catalog.category"), t("lines.unit"), `${t("lines.unitPrice")} (DT)`, "", ...(manage ? [""] : [])]}>
            {data.map((it) => (
              <tr key={it.id} className="hover:bg-surface/60">
                <Td className="font-mono text-xs text-slate-500">{it.reference}</Td>
                <Td className="font-medium text-navy">{it.designation}</Td>
                <Td>{it.category}</Td>
                <Td>{t(`units.${it.unit}`)}</Td>
                <Td className="font-semibold tabular-nums">{formatMoney(it.unit_price_ht, lang)}</Td>
                <Td><Badge>{t(`lines.${it.item_type}`)}</Badge></Td>
                {manage && (
                  <Td className="whitespace-nowrap text-end">
                    <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand" title={t("common.edit")} onClick={() => openEdit(it)}><Pencil className="h-4 w-4" /></button>
                    <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title={t("common.delete")} onClick={() => setToDelete(it)}><Trash2 className="h-4 w-4" /></button>
                  </Td>
                )}
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? t("catalog.new") : t("common.edit")} footer={
        <>
          <Button variant="outline" onClick={() => setEdit(null)}>{t("common.cancel")}</Button>
          <Button type="submit" form="catalog-form" loading={saving}>{t("common.save")}</Button>
        </>
      }>
        <form id="catalog-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label={t("catalog.reference")} required><Input dir="ltr" value={form.reference} onChange={set("reference")} required maxLength={64} placeholder="CLIM-12" /></Field>
          <Field label={t("catalog.category")}><Input value={form.category} onChange={set("category")} maxLength={100} /></Field>
          <Field label={t("lines.designation")} required className="sm:col-span-2"><Input value={form.designation} onChange={set("designation")} required maxLength={255} /></Field>
          <Field label={t("lines.unit")}><Select value={form.unit} onChange={set("unit")}>{UNITS.map((u) => <option key={u} value={u}>{t(`units.${u}`)}</option>)}</Select></Field>
          <Field label={`${t("lines.unitPrice")} (DT)`} required><Input type="number" step="0.001" min="0" dir="ltr" value={form.unit_price_ht} onChange={set("unit_price_ht")} required /></Field>
          <Field label={t("catalog.type")}><Select value={form.item_type} onChange={set("item_type")}>{TYPES.map((x) => <option key={x} value={x}>{t(`lines.${x}`)}</option>)}</Select></Field>
          <Field label="TVA %" hint={t("catalog.tvaHint")}><Input type="number" step="0.01" min="0" max="100" dir="ltr" value={form.tva_rate} onChange={set("tva_rate")} /></Field>
        </form>
      </Modal>

      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} danger confirmLabel={t("common.delete")}
        title={t("catalog.deleteTitle")} text={toDelete?.designation}
        onConfirm={async () => {
          try {
            await api(`/catalog/${toDelete!.id}`, { method: "DELETE" });
            setToDelete(null);
            reload();
          } catch (e) {
            toast.error(e);
          }
        }} />
    </>
  );
}
