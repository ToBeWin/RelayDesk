"use client";

import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { useLocale } from "@/shared/i18n/locale-provider";
import { t } from "@/shared/i18n/messages";

type ToastTone = "success" | "error" | "info";
type Toast = { id: number; message: string; tone: ToastTone };
const ToastContext = createContext<{ notify: (message: string, tone?: ToastTone) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((message: string, tone: ToastTone = "info") => { const id = Date.now() + Math.floor(Math.random() * 1000); setToasts((current) => [...current, { id, message, tone }].slice(-4)); window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5_000); }, []);
  const value = useMemo(() => ({ notify }), [notify]);
  return <ToastContext.Provider value={value}>{children}<section className="toast-region" aria-live="polite" aria-label={t(locale, "systemNotifications")}>{toasts.map((toast) => <article key={toast.id} className={`toast ${toast.tone}`}>{toast.tone === "success" ? <CheckCircle2 size={18} /> : toast.tone === "error" ? <CircleAlert size={18} /> : <Info size={18} />}<span>{toast.message}</span><button type="button" aria-label={t(locale, "closeNotification")} onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}><X size={16} /></button></article>)}</section></ToastContext.Provider>;
}

export function useToast() { const context = useContext(ToastContext); if (!context) throw new Error("useToast must be used inside ToastProvider"); return context; }
