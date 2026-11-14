"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, XCircle } from "lucide-react";
import { LinesTable, PdfActions, TotalsBox } from "@/components/DocView";
import { useToast } from "@/components/Toast";
import { Button, Card, ConfirmDialog, Empty, Field, Loading, PageHeader, StatusBadge, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, formatMoney, toNumber } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { Quote, QuoteListItem } from "@/lib/types";

export default function PortalQuotes() {
  const { t, lang } = useI18n();
  const { data, loading, reload } = useApi<QuoteListItem[]>("/portal/quotes");
  const [open, setOpen] = useState<string | null>(null);
  if (loading && !data) return <Loading />;
  return (
    <>
      <PageHeader title={t("nav.myQuotes")} />
      {!data?.length ? <Card><Empty text={t("portal.noQuotes")} /></Card> : (
        <div className="space-y-3">
          {data.map((q) => (
            <Card key={q.id} padded={false}>
              <button onClick={() => setOpen(open === q.id ? null : q.id)} className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-start">
                <span><span className="block font-bold text-navy">{q.number} · {q.title}</span><span className="text-xs text-slate-500">{formatDate(q.issue_date, lang)} · {t("quotes.validUntil")} {formatDate(q.validity_date, lang)}</span></span>
                <span className="flex items-center gap-3"><b className="tabular-nums">{formatMoney(q.total_ttc, lang)}</b><StatusBadge kind="quote" status={q.status} /><ChevronDown className={`h-4 w-4 transition ${open === q.id ? "rotate-180" : ""}`} /></span>
              </button>
              {open === q.id && <QuoteBody id={q.id} onChanged={reload} />}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function QuoteBody({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const { data: q, setData } = useApi<Quote>(`/portal/quotes/${id}`);
  const [decision, setDecision] = useState<"accepted" | "refused" | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  if (!q) return <Loading />;
  const decide = async () => {
    if (!decision) return;
    setBusy(true);
    try {
      setData(await api<Quote>(`/portal/quotes/${id}/decision`, { method: "POST", body: { decision, comment: comment || null } }));
      toast.success(decision === "accepted" ? t("portal.accepted") : t("portal.refused"));
      setDecision(null);
      onChanged();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="border-t border-slate-100">
      <LinesTable items={q.items} />
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-3">
          <PdfActions path={`/portal/quotes/${q.id}/pdf`} filename={q.number} defaultLang={q.language} />
          {q.status === "sent" && (
            <div className="flex flex-wrap gap-2">
              <Button className="bg-emerald-600 hover:bg-emerald-700" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setDecision("accepted")}>{t("quotes.accept")}</Button>
              <Button variant="danger" icon={<XCircle className="h-4 w-4" />} onClick={() => setDecision("refused")}>{t("quotes.refuse")}</Button>
            </div>
          )}
          {q.payment_terms && <p className="max-w-md whitespace-pre-line text-sm text-slate-600"><b>{t("quotes.paymentTerms")} :</b> {q.payment_terms}</p>}
        </div>
        <TotalsBox rows={[
          { label: t("lines.netHt"), value: q.total_ht, strong: true },
          ...(toNumber(q.total_discount) ? [{ label: t("lines.totalDiscount"), value: q.total_discount, negative: true }] : []),
          { label: t("lines.totalTva"), value: q.total_tva },
          { label: t("lines.grandTotal"), value: q.total_ttc, highlight: true },
        ]} />
      </div>
      <ConfirmDialog open={!!decision} onClose={() => setDecision(null)} onConfirm={decide} loading={busy} danger={decision === "refused"}
        title={decision === "accepted" ? t("quotes.accept") : t("quotes.refuse")} text={decision === "accepted" ? t("portal.acceptConfirm") : t("portal.refuseConfirm")}>
        <Field label={t("common.comment")} className="mt-3"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      </ConfirmDialog>
    </div>
  );
}
