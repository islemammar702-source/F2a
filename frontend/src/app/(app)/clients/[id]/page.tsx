"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, ArchiveRestore, ArrowLeft, Building2, Download, FilePlus2, Mail, MapPin, MessageCircle, Pencil, Phone, Receipt, User } from "lucide-react";
import { RequirePermission } from "@/components/AppShell";
import ClientFormModal from "@/components/ClientForm";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, ConfirmDialog, Empty, Loading, PageHeader, StatCard, StatusBadge, Table, Tabs, Td } from "@/components/ui";
import { api, downloadFile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatDateTime, formatMoney, waLink } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useMethodLabel } from "@/lib/useSettings";
import type { Client, DocumentFile, InvoiceListItem, Money, Payment, QuoteListItem } from "@/lib/types";

type Detail = {
  client: Client; quotes?: QuoteListItem[]; invoices?: InvoiceListItem[]; payments?: Payment[];
  documents: DocumentFile[]; totals: { invoiced: Money; paid: Money; balance: Money };
};

export default function ClientDetailPage() {
  return <RequirePermission perm="clients.view"><ClientDetail /></RequirePermission>;
}

function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const methodLabel = useMethodLabel();
  const { data, loading, reload } = useApi<Detail>(`/clients/${id}`);
  const [tab, setTab] = useState<"quotes" | "invoices" | "payments" | "documents">("invoices");
  const [edit, setEdit] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  if (loading && !data) return <Loading />;
  if (!data) return <Empty text={t("common.notFound")} />;
  const c = data.client;

  const toggleArchive = async () => {
    try {
      await api(`/clients/${c.id}/archive`, { method: "POST", query: { archived: !c.is_archived } });
      toast.success(t("common.success"));
      setConfirmArchive(false);
      reload();
    } catch (e) {
      toast.error(e);
    }
  };

  const tabs = [
    ...(data.invoices ? [{ id: "invoices" as const, label: `${t("clients.invoicesHistory")} (${data.invoices.length})` }] : []),
    ...(data.quotes ? [{ id: "quotes" as const, label: `${t("clients.quotesHistory")} (${data.quotes.length})` }] : []),
    ...(data.payments ? [{ id: "payments" as const, label: `${t("clients.payments")} (${data.payments.length})` }] : []),
    { id: "documents" as const, label: `${t("clients.documents")} (${data.documents.length})` },
  ];

  return (
    <>
      <PageHeader
        back={<Link href="/clients" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{t("clients.title")}</Link>}
        title={<span className="flex flex-wrap items-center gap-2">{c.name} {c.is_archived && <Badge color="orange">{t("clients.archivedBadge")}</Badge>}</span>}
        subtitle={t(`clients.${c.client_type}`)}
        actions={<>
          {can("quotes.manage") && !c.is_archived && <Link href={`/quotes/new?client=${c.id}`}><Button variant="accent" icon={<FilePlus2 className="h-4 w-4" />}>{t("quotes.newTitle")}</Button></Link>}
          {can("invoices.manage") && !c.is_archived && <Link href={`/invoices/new?client=${c.id}`}><Button variant="secondary" icon={<Receipt className="h-4 w-4" />}>{t("invoices.new")}</Button></Link>}
          {can("clients.manage") && <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>{t("common.edit")}</Button>}
          {can("clients.manage") && <Button variant="ghost" icon={c.is_archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />} onClick={() => (c.is_archived ? toggleArchive() : setConfirmArchive(true))}>{c.is_archived ? t("common.restore") : t("common.archive")}</Button>}
        </>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={t("clients.info")}>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center gap-3">{c.client_type === "individual" ? <User className="h-4 w-4 text-slate-400" /> : <Building2 className="h-4 w-4 text-slate-400" />}<span>{c.contact_name || c.name}</span></li>
            {c.phone && <li className="flex items-center gap-3"><Phone className="h-4 w-4 text-slate-400" /><a dir="ltr" href={`tel:${c.phone}`} className="hover:text-brand">{c.phone}</a></li>}
            {c.whatsapp && <li className="flex items-center gap-3"><MessageCircle className="h-4 w-4 text-emerald-500" /><a dir="ltr" href={waLink(c.whatsapp, "")} target="_blank" rel="noopener noreferrer" className="hover:text-brand">{c.whatsapp}</a></li>}
            {c.email && <li className="flex items-center gap-3"><Mail className="h-4 w-4 text-slate-400" /><a href={`mailto:${c.email}`} className="break-all hover:text-brand">{c.email}</a></li>}
            {(c.address || c.city) && <li className="flex items-center gap-3"><MapPin className="h-4 w-4 text-slate-400" />{[c.address, c.city].filter(Boolean).join(", ")}</li>}
            {c.tax_id && <li className="text-slate-600"><span className="text-slate-400">{t("clients.taxId")} :</span> <span dir="ltr">{c.tax_id}</span></li>}
            <li className="text-xs text-slate-400">{t("common.createdAt")} {formatDate(c.created_at, lang)}</li>
          </ul>
          {c.notes && <p className="mt-4 whitespace-pre-line rounded-lg bg-surface p-3 text-sm text-slate-600">{c.notes}</p>}
        </Card>
        <div className="grid gap-4 sm:grid-cols-3 lg:col-span-2 lg:grid-cols-3">
          <StatCard label={t("clients.totalInvoiced")} value={formatMoney(data.totals.invoiced, lang)} tone="navy" />
          <StatCard label={t("clients.totalPaid")} value={formatMoney(data.totals.paid, lang)} tone="green" />
          <StatCard label={t("clients.totalBalance")} value={formatMoney(data.totals.balance, lang)} tone="orange" />
          <div className="sm:col-span-3">
            <Tabs tabs={tabs} value={tabs.some((x) => x.id === tab) ? tab : tabs[0].id} onChange={setTab} />
            <Card padded={false}>
              {tab === "quotes" && data.quotes && (data.quotes.length === 0 ? <Empty /> : (
                <Table head={[t("quotes.number"), t("common.date"), t("quotes.object"), t("lines.grandTotal"), t("common.status")]}>
                  {data.quotes.map((q) => (
                    <tr key={q.id} className="cursor-pointer hover:bg-surface/60" onClick={() => router.push(`/quotes/${q.id}`)}>
                      <Td className="font-semibold text-brand">{q.number}</Td><Td>{formatDate(q.issue_date, lang)}</Td><Td>{q.title}</Td>
                      <Td className="tabular-nums">{formatMoney(q.total_ttc, lang)}</Td><Td><StatusBadge kind="quote" status={q.status} /></Td>
                    </tr>
                  ))}
                </Table>
              ))}
              {tab === "invoices" && data.invoices && (data.invoices.length === 0 ? <Empty /> : (
                <Table head={[t("invoices.number"), t("invoices.dueDate"), t("invoices.totalDue"), t("invoices.paid"), t("invoices.balance"), t("common.status")]}>
                  {data.invoices.map((v) => (
                    <tr key={v.id} className="cursor-pointer hover:bg-surface/60" onClick={() => router.push(`/invoices/${v.id}`)}>
                      <Td className="font-semibold text-brand">{v.number}</Td><Td>{formatDate(v.due_date, lang)}</Td>
                      <Td className="tabular-nums">{formatMoney(v.total_due, lang)}</Td><Td className="tabular-nums">{formatMoney(v.amount_paid, lang)}</Td>
                      <Td className="tabular-nums font-semibold">{formatMoney(v.balance, lang)}</Td><Td><StatusBadge kind="invoice" status={v.status} /></Td>
                    </tr>
                  ))}
                </Table>
              ))}
              {tab === "payments" && data.payments && (data.payments.length === 0 ? <Empty /> : (
                <Table head={[t("payments.number"), t("common.date"), t("payments.invoice"), t("payments.method"), t("common.amount"), t("common.status")]}>
                  {data.payments.map((p) => (
                    <tr key={p.id}>
                      <Td className="font-semibold">{p.number}</Td><Td>{formatDate(p.payment_date, lang)}</Td>
                      <Td><Link className="text-brand hover:underline" href={`/invoices/${p.invoice.id}`}>{p.invoice.number}</Link></Td>
                      <Td>{methodLabel(p.method)}</Td><Td className="tabular-nums">{formatMoney(p.amount, lang)}</Td><Td><StatusBadge kind="payment" status={p.status} /></Td>
                    </tr>
                  ))}
                </Table>
              ))}
              {tab === "documents" && (data.documents.length === 0 ? <Empty /> : (
                <ul className="divide-y divide-slate-100">
                  {data.documents.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                      <span><span className="font-semibold text-navy">{d.filename}</span><span className="block text-xs text-slate-400">{formatDateTime(d.created_at, lang)} · {(d.size_bytes / 1024).toFixed(0)} Ko</span></span>
                      <Button size="sm" variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => downloadFile(`/documents/${d.id}`, d.filename).catch(toast.error)}>{t("common.download")}</Button>
                    </li>
                  ))}
                </ul>
              ))}
            </Card>
          </div>
        </div>
      </div>
      <ClientFormModal open={edit} onClose={() => setEdit(false)} client={c} onSaved={() => reload()} />
      <ConfirmDialog open={confirmArchive} onClose={() => setConfirmArchive(false)} onConfirm={toggleArchive} title={t("common.archive")} text={t("clients.archiveConfirm")} />
    </>
  );
}
