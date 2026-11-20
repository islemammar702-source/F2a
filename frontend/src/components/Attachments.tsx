"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, FileText, Image as ImageIcon, Paperclip, Trash2, Upload } from "lucide-react";
import { api, downloadFile } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { DocumentFile } from "@/lib/types";
import { useToast } from "./Toast";
import { Button, Card } from "./ui";

/** Scanned originals attached to a quote or invoice (view / add / remove). */
export default function Attachments({ entityType, entityId, canManage }: { entityType: "quote" | "invoice"; entityId: string; canManage: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const [docs, setDocs] = useState<DocumentFile[]>([]);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<DocumentFile[]>(`/attachments/${entityType}/${entityId}`).then(setDocs).catch(() => setDocs([]));
  }, [entityType, entityId]);

  const upload = async (f?: File | null) => {
    if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      setDocs(await api<DocumentFile[]>(`/attachments/${entityType}/${entityId}/upload`, { method: "POST", form: fd }));
      toast.success(t("scan.added"));
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };

  const remove = async (d: DocumentFile) => {
    if (!window.confirm(t("scan.confirmDelete"))) return;
    try {
      await api(`/attachments/file/${d.id}`, { method: "DELETE" });
      setDocs((cur) => cur.filter((x) => x.id !== d.id));
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Card title={t("scan.attachments")} actions={canManage && (
      <Button size="sm" variant="outline" loading={busy} icon={<Upload className="h-4 w-4" />} onClick={() => ref.current?.click()}>{t("common.add")}</Button>
    )}>
      {docs.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-slate-500"><Paperclip className="h-4 w-4" />{t("scan.none")}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
              {d.mime_type === "application/pdf" ? <FileText className="h-4 w-4 shrink-0 text-accent" /> : <ImageIcon className="h-4 w-4 shrink-0 text-brand" />}
              <span className="min-w-0 flex-1 truncate">{d.filename}</span>
              <button type="button" title={t("common.view")} className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-brand"
                onClick={() => downloadFile(`/documents/${d.id}?download=false`, d.filename, "open").catch(toast.error)}><Eye className="h-4 w-4" /></button>
              {canManage && (
                <button type="button" title={t("common.delete")} className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600" onClick={() => remove(d)}><Trash2 className="h-4 w-4" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
      <input ref={ref} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
    </Card>
  );
}
