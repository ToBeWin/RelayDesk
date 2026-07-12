"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, MessageSquareText, Settings, UserCog } from "lucide-react";
import { useLocale } from "@/shared/i18n/locale-provider";
import { t, type MessageKey } from "@/shared/i18n/messages";

const navigation: { href: string; key: MessageKey; Icon: typeof MessageSquareText; admin?: boolean }[] = [
  { href: "/chat", key: "chat", Icon: MessageSquareText },
  { href: "/members", key: "members", Icon: UserCog, admin: true },
  { href: "/settings", key: "settings", Icon: Settings, admin: true },
];

export function WorkspaceNavigation({ operatorName, isAdmin, collapsed = false }: { operatorName: string; isAdmin: boolean; collapsed?: boolean }) {
  const pathname = usePathname();
  const { locale } = useLocale();

  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (response.ok) window.location.assign("/login");
  }

  return <><nav>{navigation.filter((item) => !item.admin || isAdmin).map(({ href, key, Icon }) => <Link className={pathname === href ? "active" : undefined} key={href} href={href} title={t(locale, key)}><Icon size={18} /><span className="sidebar-label">{t(locale, key)}</span></Link>)}</nav><div className="operator-card"><span>{operatorName.slice(0, 1)}</span>{!collapsed ? <div><strong>{operatorName}</strong><small>{isAdmin ? t(locale, "administrator") : t(locale, "member")}</small></div> : null}<button type="button" onClick={logout} aria-label={t(locale, "logout")} title={t(locale, "logout")}><LogOut size={16} /></button></div></>;
}
