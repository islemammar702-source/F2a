"use client";

import { CreditCard } from "lucide-react";
import { Card, Empty, Loading, PageHeader, Table, Td } from "@/components/ui";
import { formatDate, formatMoney, toNumber } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useMethodLabel } from "@/lib/useSettings";
import type { Payment } from "@/lib/types";

export default function PortalPayments() {
  const { t, lang } = useI18n();
  const methodLabel = useMethodLabel();
  const { data, loading } = useApi<Payment[]>("/portal/payments");
  if (loading && !data) return <Loading />;
  const total = (data ?? []).reduce((s, p) => s + toNumber(p.amount), 0);
  return (
    <>
      <PageHeader title={t("nav.myPayments")} subtitle={data?.length ? `${t("common.total")} : ${formatMoney(total, lang)}` : undefined} />
      <Card padded={false}>
        {!data?.length ? <Empty icon={<CreditCard className="h-10 w-10" />} text={t("portal.noPayments")} /> : (
          <Table head={[t("common.date"), t("payments.invoice"), t("payments.method"), t("common.reference"), t("common.amount")]}>
            {data.map((p) => (
              <tr key={p.id}>
                <Td>{formatDate(p.payment_date, lang)}</Td>
                <Td className="font-semibold">{p.invoice.number}</Td>
                <Td>{methodLabel(p.method)}</Td>
                <Td dir="ltr">{p.reference ?? "—"}</Td>
                <Td className="font-semibold tabular-nums text-emerald-700">{formatMoney(p.amount, lang)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
