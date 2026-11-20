"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { RequirePermission } from "@/components/AppShell";
import DocumentEditor, { toPayloadItems, type EditorValue } from "@/components/DocumentEditor";
import { useToast } from "@/components/Toast";
import { Loading, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Invoice } from "@/lib/types";

export default function NewInvoicePage() {
  return <RequirePermission perm="invoices.manage"><Suspense fallback={<Loading />}><NewInvoice /></Suspense></RequirePermission>;
}

function NewInvoice() {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [saving, setSaving] = useState(false);

  const submit = async (v: EditorValue) => {
    setSaving(true);
    try {
      const inv = await api<Invoice>("/invoices", {
        method: "POST",
        body: {
          client_id: v.client_id, title: v.title, site_address: v.site_address || null, issue_date: v.issue_date,
          due_date: v.second_date || null, payment_terms: v.payment_terms || null, notes: v.notes || null,
          language: v.language, apply_stamp_duty: v.apply_stamp_duty, items: toPayloadItems(v.items),
        },
      });
      if (v.attachments?.length) {
        await api(`/attachments/invoice/${inv.id}`, { method: "POST", body: { document_ids: v.attachments.map((d) => d.id) } }).catch(toast.error);
      }
      toast.success(`${t("invoices.created")} – ${inv.number}`);
      router.push(`/invoices/${inv.id}`);
    } catch (e) {
      toast.error(e);
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title={t("invoices.newTitle")} subtitle={t("invoices.subtitle")} />
      <DocumentEditor kind="invoice" scan initial={{ client_id: params.get("client") ?? "" }} onSubmit={submit} saving={saving} />
    </>
  );
}
