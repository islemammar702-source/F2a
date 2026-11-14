"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Client } from "@/lib/types";
import { useToast } from "./Toast";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";

const EMPTY = { client_type: "individual", name: "", contact_name: "", phone: "", whatsapp: "", email: "", address: "", city: "", tax_id: "", notes: "" };

export default function ClientFormModal({ open, onClose, client, onSaved, prefill }: { open: boolean; onClose: () => void; client?: Client | null; onSaved: (c: Client) => void; prefill?: Client | null }) {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState<Record<string, string>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setErrors({});
      const src = client ?? prefill;
      setForm(src ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, String((src as Record<string, unknown>)[k] ?? (EMPTY as Record<string, string>)[k])])) : EMPTY);
    }
  }, [open, client, prefill]);

  const set = (k: string) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 2) errs.name = t("common.required");
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) errs.email = t("errors.validation_error");
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() === "" && k !== "name" ? null : v.trim()]));
      const saved = client
        ? await api<Client>(`/clients/${client.id}`, { method: "PATCH", body })
        : await api<Client>("/clients", { method: "POST", body });
      toast.success(client ? t("clients.updated") : t("clients.created"));
      onSaved(saved);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(Object.fromEntries(err.errors.map((x) => [x.field, x.message])));
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title={client ? t("clients.edit") : t("clients.new")} footer={
      <>
        <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" form="client-form" loading={saving}>{t("common.save")}</Button>
      </>
    }>
      <form id="client-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label={t("clients.type")}>
          <Select value={form.client_type} onChange={set("client_type")}>
            <option value="individual">{t("clients.individual")}</option>
            <option value="company">{t("clients.company")}</option>
            <option value="public">{t("clients.public")}</option>
          </Select>
        </Field>
        <Field label={t("clients.name")} required error={errors.name}><Input value={form.name} onChange={set("name")} autoFocus /></Field>
        {form.client_type !== "individual" && <Field label={t("clients.contactName")}><Input value={form.contact_name} onChange={set("contact_name")} /></Field>}
        <Field label={t("common.phone")}><Input type="tel" dir="ltr" value={form.phone} onChange={set("phone")} placeholder="+216 …" /></Field>
        <Field label={t("clients.whatsapp")}><Input type="tel" dir="ltr" value={form.whatsapp} onChange={set("whatsapp")} placeholder="+216 …" /></Field>
        <Field label={t("common.email")} error={errors.email}><Input type="email" dir="ltr" value={form.email} onChange={set("email")} /></Field>
        <Field label={t("common.address")}><Input value={form.address} onChange={set("address")} /></Field>
        <Field label={t("common.city")}><Input value={form.city} onChange={set("city")} /></Field>
        <Field label={t("clients.taxId")} hint={t("common.optional")}><Input dir="ltr" value={form.tax_id} onChange={set("tax_id")} /></Field>
        <Field label={t("common.notes")} className="sm:col-span-2"><Textarea value={form.notes} onChange={set("notes")} /></Field>
      </form>
    </Modal>
  );
}
