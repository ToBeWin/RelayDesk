"use client";

import { Archive, ArrowRight, Check, FileText, LockKeyhole, MessageSquare, Send, Sparkles } from "lucide-react";
import { FormEvent, useState } from "react";
import { BrandSymbol } from "@/shared/components/brand-symbol";
import { useLocale } from "@/shared/i18n/locale-provider";
import { t } from "@/shared/i18n/messages";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const { locale, setLocale } = useLocale();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: form.get("password"), operatorName: form.get("operatorName") }) });
    setPending(false);
    if (!response.ok) return setError((await response.json()).message ?? t(locale, "loginFailed"));
    window.location.assign("/chat");
  }

  return <main className="login-page">
    <section className="login-story" aria-label="RelayDesk product overview">
      <div className="login-story-intro">
        <div className="login-wordmark"><span className="brand-mark"><BrandSymbol /></span><strong>RelayDesk</strong></div>
        <p className="login-kicker">{t(locale, "loginKicker")}</p>
        <h1>{t(locale, "loginHero")}</h1>
        <p>{t(locale, "loginHeroDescription")}</p>
      </div>
      <div className="login-preview-grid" aria-hidden="true">
        <article className="login-conversation-preview">
          <header><span><MessageSquare size={16} /> {t(locale, "agentConversation")}</span><b><i />Hermes Agent {t(locale, "connected")}</b></header>
          <div className="preview-message preview-user"><span>{t(locale, "previewUserInitial")}</span><p>{t(locale, "previewUserMessage")}</p><time>{t(locale, "previewTime")}</time></div>
          <div className="preview-message preview-agent"><span><Sparkles size={16} /></span><div><strong>Hermes Agent</strong><p>{t(locale, "previewAgentIntro")}</p><ul><li>{t(locale, "previewPointOne")}</li><li>{t(locale, "previewPointTwo")}</li><li>{t(locale, "previewPointThree")}</li></ul><p>{t(locale, "previewFollowUp")}</p><small><Check size={13} /> {t(locale, "previewActionOne")}</small><small><Check size={13} /> {t(locale, "previewActionTwo")}</small></div></div>
          <footer><span>{t(locale, "previewComposer")}</span><button type="button"><Send size={16} /></button></footer>
        </article>
        <div className="login-preview-side">
          <article className="login-agent-preview"><h2>Hermes Agent</h2><span className="agent-ready"><i />{t(locale, "connected")}</span><p>{t(locale, "agentHealthy")}</p><button type="button">{t(locale, "viewAgentStatus")} <ArrowRight size={16} /></button></article>
          <article className="login-archive-preview"><header><Archive size={17} />{t(locale, "archivedWork")}</header><div><span><FileText size={20} /></span><section><strong>{t(locale, "archiveFileName")}</strong><p>{t(locale, "archiveLocation")}</p><small>{t(locale, "archiveBy")}</small></section></div><p>{t(locale, "archiveDescription")}</p><button type="button">{t(locale, "viewDetails")} <ArrowRight size={16} /></button></article>
        </div>
      </div>
    </section>
    <section className="login-panel">
      <div className="login-card">
        <div className="login-brand-row"><div className="login-brand"><span className="brand-mark"><BrandSymbol /></span><strong>RelayDesk</strong></div><button className="login-locale-switch" type="button" onClick={() => setLocale(locale === "en" ? "zh-CN" : "en")} aria-label={locale === "en" ? "Switch to Chinese" : "Switch to English"}>{locale === "en" ? "中文" : "EN"}</button></div>
        <p className="eyebrow">{t(locale, "internalWorkspace")}</p>
        <h2>{t(locale, "loginTitle")}</h2>
        <p className="muted">{t(locale, "loginDescription")}</p>
        <form action="/api/auth/login" method="post" onSubmit={submit}>
          <label>{t(locale, "memberName")}<input name="operatorName" placeholder={t(locale, "memberNamePlaceholder")} autoComplete="username" required /></label>
          <label>{t(locale, "password")}<input name="password" type="password" placeholder={t(locale, "passwordPlaceholder")} autoComplete="current-password" required /></label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" disabled={pending}>{pending ? t(locale, "verifying") : t(locale, "signIn")}<ArrowRight size={17} /></button>
        </form>
        <p className="login-note"><LockKeyhole size={15} /><span>{t(locale, "internalOnly")}<br /><small>{t(locale, "firstUse")}</small></span></p>
      </div>
    </section>
  </main>;
}
