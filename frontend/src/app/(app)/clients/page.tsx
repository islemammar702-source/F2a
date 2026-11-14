"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Mail, MessageCircle, Phone, Plus, Search, Users } from "lucide-react";
import { RequirePermission } from "@/components/AppShell";
import ClientFormModal from "@/components/ClientForm";
import { Badge, Button, Card, Checkbox, Empty, Input, Loading, PageHeader, Pagination, Select, Table, Td } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatMoney, toNumber, waLink } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { Client, Page } from "@/lib/types";

export default function ClientsPage() {
  return <RequirePermission perm="clients.view"><Suspense fallback={<Loading />}><ClientsList /></Suspense></RequirePermission>;
}

function ClientsList() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [archived, setArchived] = useState(false);
  const [withBalance, setWithBalance] = useState(false);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const dq = useDebounced(q);
  const { data, loading, reload } = useApi<Page<Client>>("/clients", { q: dq, client_type: type, archived, with_balance: withBalance || undefined, page, page_size: 15 });

  useEffect(() => setPage(1), [dq, type, archived, withBalance]);
  useEffect(() => {
    if (params.get("new") === "1" && can("clients.manage")) setModal(true);
  }, [params, can]);

  return (
    <>
      <PageHeader title={t("clients.title")} subtitle={t("clients.subtitle")}
        actions={can("clients.manage") && <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => setModal(true)}>{t("clients.new")}</Button>} />
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="ps-9" placeholder={t("common.search")} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select className="w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label={t("clients.type")}>
            <option value="">{t("clients.type")} : {t("common.all")}</option>
            <option value="individual">{t("clients.individual")}</option>
            <option value="company">{t("clients.company")}</option>
            <option value="public">{t("clients.public")}</option>
          </Select>
          <Checkbox label={t("clients.withBalance")} checked={withBalance} onChange={setWithBalance} />
          <Checkbox label={t("clients.archived")} checked={archived} onChange={setArchived} />
        </div>
        {loading && !data ? <Loading /> : data && data.items.length === 0 ? <Empty icon={<Users className="h-10 w-10" />} /> : data && (
          <>
            <Table head={[t("common.name"), t("clients.type"), t("common.phone"), t("common.city"), t("clients.invoiced"), t("clients.balance"), ""]}>
              {data.items.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-surface/60" onClick={() => router.push(`/clients/${c.id}`)}>
                  <Td>
                    <div className="font-semibold text-navy">{c.name}</div>
                    {c.email && <div className="text-xs text-slate-500">{c.email}</div>}
                  </Td>
                  <Td><Badge color={c.client_type === "company" ? "blue" : c.client_type === "public" ? "navy" : "gray"}>{t(`clients.${c.client_type}`)}</Badge> {c.is_archived && <Badge color="orange">{t("clients.archivedBadge")}</Badge>}</Td>
                  <Td><span dir="ltr">{c.phone ?? "—"}</span></Td>
                  <Td>{c.city ?? "—"}</Td>
                  <Td className="tabular-nums">{formatMoney(c.total_invoiced, lang)}</Td>
                  <Td className={`tabular-nums font-semibold ${toNumber(c.balance) > 0 ? "text-red-600" : "text-emerald-600"}`}>{formatMoney(c.balance, lang)}</Td>
                  <Td>
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      {c.phone && <a href={`tel:${c.phone}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={t("common.phone")}><Phone className="h-4 w-4" /></a>}
                      {c.whatsapp && <a href={waLink(c.whatsapp, "")} target="_blank" rel="noopener noreferrer" className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50" aria-label="WhatsApp"><MessageCircle className="h-4 w-4" /></a>}
                      {c.email && <a href={`mailto:${c.email}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={t("common.email")}><Mail className="h-4 w-4" /></a>}
                      <Link href={`/clients/${c.id}`} className="rounded-lg px-2 py-2 text-xs font-semibold text-brand hover:bg-brand-50">{t("common.view")}</Link>
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
            <Pagination page={page} pageSize={15} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>
      <ClientFormModal open={modal} onClose={() => setModal(false)} onSaved={(c) => { reload(); router.push(`/clients/${c.id}`); }} />
    </>
  );
}
