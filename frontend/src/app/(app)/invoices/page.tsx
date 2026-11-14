"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { FileText, Plus, Search } from "lucide-react";
import { RequirePermission } from "@/components/AppShell";
import { Button, Card, Checkbox, Empty, Input, Loading, PageHeader, Pagination, Select, StatusBadge, Table, Td } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatDate, formatMoney, toNumber } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { InvoiceListItem, Page } from "@/lib/types";

export default function InvoicesPage() {
  return <RequirePermission perm="invoices.view"><Suspense fallback={<Loading />}><InvoicesList /></Suspense></RequirePermission>;
}

function InvoicesList() {
  const { t, lang, dict } = useI18n();
  const { can } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [openOnly, setOpenOnly] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, loading } = useApi<Page<InvoiceListItem>>("/invoices", { q: dq, status, open_only: openOnly || undefined, date_from: from, date_to: to, page, page_size: 15 });
  useEffect(() => setPage(1), [dq, status, openOnly, from, to]);

  return (
    <>
      <PageHeader title={t("invoices.title")} subtitle={t("invoices.subtitle")}
        actions={can("invoices.manage") && <Link href="/invoices/new"><Button variant="accent" icon={<Plus className="h-4 w-4" />}>{t("invoices.new")}</Button></Link>} />
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="ps-9" placeholder={t("common.search")} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t("common.status")}>
            <option value="">{t("common.status")} : {t("common.all")}</option>
            {Object.entries(dict.status.invoice).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Input type="date" className="w-auto" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("common.from")} />
          <Input type="date" className="w-auto" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("common.to")} />
          <Checkbox label={t("invoices.openOnly")} checked={openOnly} onChange={setOpenOnly} />
        </div>
        {loading && !data ? <Loading /> : data && data.items.length === 0 ? <Empty icon={<FileText className="h-10 w-10" />} /> : data && (
          <>
            <Table head={[t("invoices.number"), t("quotes.client"), t("invoices.issueDate"), t("invoices.dueDate"), t("invoices.totalDue"), t("invoices.paid"), t("invoices.balance"), t("common.status")]}>
              {data.items.map((x) => (
                <tr key={x.id} className="cursor-pointer hover:bg-surface/60" onClick={() => router.push(`/invoices/${x.id}`)}>
                  <Td className="font-semibold text-brand">{x.number}</Td>
                  <Td>{x.client.name}</Td>
                  <Td>{formatDate(x.issue_date, lang)}</Td>
                  <Td className={x.status === "overdue" ? "font-semibold text-red-600" : ""}>{formatDate(x.due_date, lang)}</Td>
                  <Td className="tabular-nums">{formatMoney(x.total_due, lang)}</Td>
                  <Td className="tabular-nums text-emerald-700">{formatMoney(x.amount_paid, lang)}</Td>
                  <Td className={`tabular-nums font-semibold ${toNumber(x.balance) > 0 ? "text-navy" : "text-slate-400"}`}>{formatMoney(x.balance, lang)}</Td>
                  <Td><StatusBadge kind="invoice" status={x.status} /></Td>
                </tr>
              ))}
            </Table>
            <Pagination page={page} pageSize={15} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
