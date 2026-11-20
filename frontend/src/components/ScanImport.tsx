"use client";

import { useRef, useState } from "react";
import { Camera, CheckCircle2, FileUp, Loader2, ScanLine, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { ScanResult } from "@/lib/types";
import { useToast } from "./Toast";

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";

/**
 * Zone "Scanner / importer": take a photo (phone camera) or pick an image/PDF.
 * The file is uploaded to /api/scan/{target}; the server keeps it and, if the AI reader is configured,
 * returns the data read from it. The parent pre-fills its form with `onResult`.
 */
export default function ScanImport<T>({ target, onResult, compact = false }: {
  target: "quote" | "invoice" | "payment";
  onResult: (r: ScanResult<T>) => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async (f: File | undefined | null) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      setStatus({ ok: false, text: t("errors.file_too_large") });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await api<ScanResult<T>>(`/scan/${target}`, { method: "POST", form: fd });
      if (r.extracted) setStatus({ ok: true, text: t("scan.readOk") });
      else if (r.ai_error) setStatus({ ok: false, text: `${t(`errors.${r.ai_error}`)} ${t("scan.fileKept")}` });
      else setStatus({ ok: true, text: t("scan.attachedOnly") });
      onResult(r);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
      if (camRef.current) camRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className={`relative overflow-hidden rounded-2xl border-2 border-dashed border-ice/50 bg-gradient-to-br from-ice-50 to-white ${compact ? "p-4" : "p-5"}`}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-ice to-brand text-white">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ScanLine className="h-5 w-5" />}
        </div>
        <div className="min-w-[200px] flex-1">
          <p className="font-bold text-navy">{t(`scan.title_${target}`)}</p>
          <p className="text-sm text-slate-500">{busy ? t("scan.reading") : t("scan.hint")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => camRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-navy px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50">
            <Camera className="h-4 w-4" />{t("scan.photo")}
          </button>
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-navy ring-1 ring-slate-300 transition hover:ring-brand disabled:opacity-50">
            <FileUp className="h-4 w-4" />{t("scan.file")}
          </button>
        </div>
      </div>
      {status && (
        <p className={`mt-3 flex items-start gap-2 text-sm ${status.ok ? "text-emerald-700" : "text-amber-700"}`}>
          {status.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />}{status.text}
        </p>
      )}
      {/* capture="environment" opens the rear camera directly on phones */}
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => send(e.target.files?.[0])} />
      <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => send(e.target.files?.[0])} />
    </div>
  );
}
