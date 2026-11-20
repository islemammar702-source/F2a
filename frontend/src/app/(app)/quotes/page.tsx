"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { FilePlus2, FileSignature, Search, Trash2 } from "lucide-react";
import { RequirePermission } from "@/components/AppShell";
import { useToast } from "@/components/Toast";
import { Button, Card, ConfirmDialog, Empty, Input, Loading, PageHeader, Pagination, Select, StatusBadge, Table, Td } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { Page, QuoteListItem } from "@/lib/types";

export default function QuotesPage() {
  return <RequirePermission perm="quotes.view"><Suspense fallback={<Loading />}><QuotesList /></Suspense></RequirePermission>;
}

function QuotesList() {
  const { t, lang, dict } = useI18n();
  const { can } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, loading, reload } = useApi<Page<QuoteListItem>>("/quotes", { q: dq, status, date_from: from, date_to: to, page, page_size: 15 });
  const toast = useToast();
  const manage = can("quotes.manage");
  const [toDelete, setToDelete] = useState<QuoteListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const doDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api(`/quotes/${toDelete.id}`, { method: "DELETE" });
      toast.success(`${t("quotes.deleted")} – ${toDelete.number}`);
      setToDelete(null);
      reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setDeleting(false);
    }
  };
  useEffect(() => setPage(1), [dq, status, from, to]);

  return (
    <>
      <PageHeader title={t("quotes.title")} subtitle={t("quotes.subtitle")}
        actions={can("quotes.manage") && <Link href="/quotes/new"><Button variant="accent" size="lg" icon={<FilePlus2 className="h-5 w-5" />}>{t("quotes.new")}</Button></Link>} />
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="ps-9" placeholder={t("common.search")} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t("common.status")}>
            <option value="">{t("common.status")} : {t("common.all")}</option>
            {Object.entries(dict.status.quote).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Input type="date" className="w-auto" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("common.from")} />
          <Input type="date" className="w-auto" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("common.to")} />
        </div>
        {loading && !data ? <Loading /> : data && data.items.length === 0 ? <Empty icon={<FileSignature className="h-10 w-10" />} /> : data && (
          <>
            <Table head={[t("quotes.number"), t("quotes.client"), t("quotes.object"), t("common.date"), t("quotes.validUntil"), t("lines.totalHt"), t("lines.grandTotal"), t("common.status"), ...(manage ? [""] : [])]}>
              {data.items.map((x) => (
                <tr key={x.id} className="cursor-pointer hover:bg-surface/60" onClick={() => router.push(`/quotes/${x.id}`)}>
                  <Td className="font-semibold text-brand">{x.number}</Td>
                  <Td>{x.client.name}</Td>
                  <Td className="max-w-[240px] truncate">{x.title}</Td>
                  <Td>{formatDate(x.issue_date, lang)}</Td>
                  <Td>{formatDate(x.validity_date, lang)}</Td>
                  <Td className="tabular-nums">{formatMoney(x.total_ht, lang)}</Td>
                  <Td className="font-semibold tabular-nums">{formatMoney(x.total_ttc, lang)}</Td>
                  <Td><StatusBadge kind="quote" status={x.status} /></Td>
                  {manage && (
                    <Td>
                      <button type="button" title={t("common.delete")} aria-label={t("common.delete")}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        onClick={(e) => { e.stopPropagation(); setToDelete(x); }}><Trash2 className="h-4 w-4" /></button>
                    </Td>
                  )}
                </tr>
              ))}
            </Table>
            <Pagination page={page} pageSize={15} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={doDelete} loading={deleting} danger
        title={t("quotes.deleteTitle")} text={t("quotes.deleteText", { number: toDelete?.number ?? "" })} confirmLabel={t("common.delete")} />
    </>
  );
}
