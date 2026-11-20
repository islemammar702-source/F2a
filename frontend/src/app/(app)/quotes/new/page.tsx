"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { RequirePermission } from "@/components/AppShell";
import DocumentEditor, { toPayloadItems, type EditorValue } from "@/components/DocumentEditor";
import { useToast } from "@/components/Toast";
import { Loading, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Quote, QuoteRequest } from "@/lib/types";

export default function NewQuotePage() {
  return <RequirePermission perm="quotes.manage"><Suspense fallback={<Loading />}><NewQuote /></Suspense></RequirePermission>;
}

function NewQuote() {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [saving, setSaving] = useState(false);
  const clientId = params.get("client") ?? "";
  const requestId = params.get("request");
  const [initial, setInitial] = useState<Partial<EditorValue> | null>(requestId ? null : { client_id: clientId });

  useEffect(() => {
    if (!requestId) return;
    api<{ items: QuoteRequest[] }>("/requests", { query: { page_size: 100 } }).then((p) => {
      const r = p.items.find((x) => x.id === requestId);
      setInitial({ client_id: clientId || r?.client_id || "", title: r ? `${t(`services.${r.service}`)} – ${r.name}` : "", site_address: r?.address ?? "", notes: r?.message ?? "" });
    }).catch(() => setInitial({ client_id: clientId }));
  }, [requestId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (v: EditorValue) => {
    setSaving(true);
    try {
      const q = await api<Quote>("/quotes", {
        method: "POST",
        body: {
          client_id: v.client_id, request_id: requestId, title: v.title, site_address: v.site_address || null,
          issue_date: v.issue_date, validity_date: v.second_date || null, payment_terms: v.payment_terms || null,
          special_conditions: v.special_conditions || null, notes: v.notes || null, language: v.language, items: toPayloadItems(v.items),
        },
      });
      if (v.attachments?.length) {
        // attach the scanned originals; the quote is already saved even if this fails
        await api(`/attachments/quote/${q.id}`, { method: "POST", body: { document_ids: v.attachments.map((d) => d.id) } }).catch(toast.error);
      }
      toast.success(`${t("quotes.created")} – ${q.number}`);
      router.push(`/quotes/${q.id}`);
    } catch (e) {
      toast.error(e);
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title={t("quotes.newTitle")} subtitle={t("quotes.subtitle")} />
      {initial ? <DocumentEditor kind="quote" scan initial={initial} onSubmit={submit} saving={saving} /> : <Loading />}
    </>
  );
}
