"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type Toast = { id: number; type: "success" | "error"; text: string };
type Ctx = { success: (text: string) => void; error: (err: unknown) => void };
const ToastCtx = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const { t } = useI18n();

  const push = useCallback((type: Toast["type"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { id, type, text }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 5000);
  }, []);

  const value: Ctx = {
    success: (text) => push("success", text),
    error: (err) => push("error", errorMessage(err, t)),
  };

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${x.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
            {x.type === "success" ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
            <span className="flex-1">{x.text}</span>
            <button onClick={() => setToasts((ts) => ts.filter((y) => y.id !== x.id))} aria-label="close"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function errorMessage(err: unknown, t: (k: string) => string): string {
  if (err instanceof ApiError) {
    const msg = t(`errors.${err.code}`);
    if (msg !== `errors.${err.code}`) {
      if (err.code === "validation_error" && err.errors?.length) {
        return `${msg} (${err.errors.map((e) => e.field).join(", ")})`;
      }
      return msg;
    }
  }
  return t("common.error");
}

export function useToast() {
  const c = useContext(ToastCtx);
  if (!c) throw new Error("useToast outside ToastProvider");
  return c;
}
