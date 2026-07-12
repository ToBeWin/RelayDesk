"use client";

import { ChevronLeft, ChevronRight, Languages } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BrandSymbol } from "@/shared/components/brand-symbol";
import { WorkspaceNavigation } from "@/shared/components/workspace-navigation";
import { useLocale } from "@/shared/i18n/locale-provider";
import { t } from "@/shared/i18n/messages";

export function WorkspaceSidebar({ operatorName, isAdmin, runtimeLabel }: { operatorName: string; isAdmin: boolean; runtimeLabel: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, setLocale } = useLocale();
  const displayRuntimeLabel = locale === "en"
    ? runtimeLabel.replace("已连接", "connected").replace("就绪", "ready").replace("未配置", "not configured")
    : runtimeLabel;
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setCollapsed(window.localStorage.getItem("relaydesk:sidebar-collapsed") === "true"), 0);
    return () => window.clearTimeout(timer);
  }, []);
  function toggle() { setCollapsed((current) => { const next = !current; window.localStorage.setItem("relaydesk:sidebar-collapsed", String(next)); return next; }); }
  function createConversation() {
    if (pathname === "/chat") window.dispatchEvent(new Event("relaydesk:new-conversation"));
    else router.push("/chat?new=1");
  }
  const nextLanguageLabel = locale === "en" ? "中文" : "EN";
  const switchLabel = locale === "en" ? "Switch to Chinese" : "Switch to English";
  return <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}><button className="sidebar-collapse" type="button" onClick={toggle} aria-label={collapsed ? t(locale, "expand") : t(locale, "collapse")} title={collapsed ? t(locale, "expand") : t(locale, "collapse")}>{collapsed ? <ChevronRight size={16} strokeWidth={2.25} /> : <ChevronLeft size={16} strokeWidth={2.25} />}</button><div className="sidebar-top"><div className="sidebar-brand"><span className="brand-mark"><BrandSymbol /></span><span className="sidebar-label"><strong>RelayDesk</strong><small>AI Agent Workspace</small></span></div></div><button className="primary-button new-button" type="button" onClick={createConversation} title={t(locale, "newConversation")}><span className="sidebar-label">{t(locale, "newConversation")}</span><span className="sidebar-icon-only">+</span></button><WorkspaceNavigation operatorName={operatorName} isAdmin={isAdmin} collapsed={collapsed} /><div className="sidebar-footer"><button className="locale-switch" type="button" onClick={() => setLocale(locale === "en" ? "zh-CN" : "en")} aria-label={switchLabel} title={switchLabel}><Languages size={14} /><span>{nextLanguageLabel}</span></button><span className="status-dot" /> <span className="sidebar-label">{displayRuntimeLabel}</span></div></aside>;
}
