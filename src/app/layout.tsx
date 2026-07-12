import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/shared/components/toast-provider";
import { LocaleProvider } from "@/shared/i18n/locale-provider";

export const metadata: Metadata = { title: "RelayDesk", description: "让 Agent 的每一次对话，都成为可管理的工作成果。" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><LocaleProvider><ToastProvider>{children}</ToastProvider></LocaleProvider></body></html>; }
