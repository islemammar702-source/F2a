"use client";

import Link from "next/link";
import { useState } from "react";
import { FilePlus2, Inbox, Mail, MessageCircle, Phone, UserPlus } from "lucide-react";
import { RequirePermission } from "@/components/AppShell";
import ClientFormModal from "@/components/ClientForm";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, Empty, Loading, PageHeader, Pagination, Select, StatusBadge, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime, waLink } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { Client, Page, QuoteRequest } from "@/lib/types";

export default function RequestsPage() {
  return <RequirePermission perm="requests.view"><Requests /></RequirePermission>;
}

function Requests() {
  const { t, lang, dict } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading, reload } = useApi<Page<QuoteRequest>>("/requests", { status, page, page_size: 10 });
  const [clientFor, setClientFor] = useState<QuoteRequest | null>(null);
  const manage = can("requests.manage");

  const update = async (r: QuoteRequest, body: Partial<QuoteRequest>) => {
    try {
      await api(`/requests/${r.id}`, { method: "PATCH", body });
      toast.success(t("common.success"));
      reload();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <>
      <PageHeader title={t("requests.title")} subtitle={t("requests.subtitle")} actions={
        <Select className="w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label={t("common.status")}>
          <option value="">{t("common.status")} : {t("common.all")}</option>
          {Object.entries(dict.status.request).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      } />
      {loading && !data ? <Loading /> : data && data.items.length === 0 ? <Card><Empty icon={<Inbox className="h-10 w-10" />} /></Card> : data && (
        <div className="space-y-4">
          {data.items.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-navy">{r.name}</h3>
                    <Badge color="blue">{r.service === "contact" ? t("requests.contactMessage") : t(`services.${r.service}`)}</Badge>
                    <StatusBadge kind="request" status={r.status} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{formatDateTime(r.created_at, lang)}{r.address ? ` · ${r.address}` : ""}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100" dir="ltr"><Phone className="h-4 w-4" />{r.phone}</a>
                  <a href={waLink(r.phone, "")} target="_blank" rel="noopener noreferrer" className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50" aria-label="WhatsApp"><MessageCircle className="h-4 w-4" /></a>
                  {r.email && <a href={`mailto:${r.email}`} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="email"><Mail className="h-4 w-4" /></a>}
                </div>
              </div>
              <p className="mt-3 whitespace-pre-line rounded-lg bg-surface p-3 text-sm text-slate-700">{r.message}</p>
              {manage && (
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <Select className="w-auto" value={r.status} onChange={(e) => update(r, { status: e.target.value })} aria-label={t("common.status")}>
                    {Object.entries(dict.status.request).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                  {!r.client_id && can("clients.manage") && <Button size="sm" variant="outline" icon={<UserPlus className="h-4 w-4" />} onClick={() => setClientFor(r)}>{t("requests.linkClient")}</Button>}
                  {r.client_id && <Link href={`/clients/${r.client_id}`} className="text-sm font-semibold text-brand hover:underline">{t("quotes.client")}</Link>}
                  {can("quotes.manage") && r.service !== "contact" && (
                    <Link href={`/quotes/new?request=${r.id}${r.client_id ? `&client=${r.client_id}` : ""}`}><Button size="sm" variant="accent" icon={<FilePlus2 className="h-4 w-4" />}>{t("requests.createQuote")}</Button></Link>
                  )}
                  <div className="min-w-[240px] flex-1">
                    <Textarea className="min-h-[40px]" placeholder={t("requests.internalNotes")} defaultValue={r.internal_notes ?? ""} onBlur={(e) => e.target.value !== (r.internal_notes ?? "") && update(r, { internal_notes: e.target.value })} />
                  </div>
                </div>
              )}
            </Card>
          ))}
          <Card padded={false}><Pagination page={page} pageSize={10} total={data.total} onChange={setPage} /></Card>
        </div>
      )}
      <ClientFormModalForRequest req={clientFor} onClose={() => setClientFor(null)} onLinked={reload} />
    </>
  );
}

function ClientFormModalForRequest({ req, onClose, onLinked }: { req: QuoteRequest | null; onClose: () => void; onLinked: () => void }) {
  const pre = req ? ({ id: "", name: req.name, phone: req.phone, whatsapp: req.phone, email: req.email, address: req.address, client_type: "individual" } as unknown as Client) : null;
  return (
    <ClientFormModal open={!!req} onClose={onClose} client={null} prefill={pre} onSaved={async (c) => {
      if (req) await api(`/requests/${req.id}`, { method: "PATCH", body: { client_id: c.id, status: "in_progress" } }).catch(() => {});
      onLinked();
    }} />
  );
}
