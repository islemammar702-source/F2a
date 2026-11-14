"use client";

import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import type { Activity } from "@/lib/types";

export default function ActivityRow({ a }: { a: Activity }) {
  const { t, lang } = useI18n();
  return (
    <li className="flex gap-3 px-5 py-3 text-sm">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
      <span className="min-w-0">
        <span className="text-navy"><b>{a.user_name ?? t("common.system")}</b> {t(`activity.${a.action}`)} <b className="ltr-nums">{a.summary}</b></span>
        <span className="block text-xs text-slate-400">{formatDateTime(a.created_at, lang)}</span>
      </span>
    </li>
  );
}
