"use client";

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

export type Locale = "en" | "zh-CN";
const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void } | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("en");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem("relaydesk:locale") as Locale | null;
      const next = saved === "en" || saved === "zh-CN" ? saved : navigator.language.startsWith("zh") ? "zh-CN" : "en";
      setLocale(next); document.documentElement.lang = next;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const update = (next: Locale) => { window.localStorage.setItem("relaydesk:locale", next); setLocale(next); document.documentElement.lang = next; };
  return <LocaleContext.Provider value={{ locale, setLocale: update }}>{children}</LocaleContext.Provider>;
}

export function useLocale() { const value = useContext(LocaleContext); if (!value) throw new Error("useLocale must be used inside LocaleProvider"); return value; }
