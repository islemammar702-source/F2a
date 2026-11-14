"use client";

import { PageHero } from "@/components/PublicSite";
import RequestForm from "@/components/RequestForm";
import { useI18n } from "@/lib/i18n";

export default function RequestQuotePage() {
  const { t } = useI18n();
  return (
    <>
      <PageHero title={t("public.requestTitle")} text={t("public.requestText")} />
      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
          <RequestForm endpoint="/public/quote-request" />
        </div>
      </section>
    </>
  );
}
