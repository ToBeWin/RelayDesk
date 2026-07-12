"use client";

import { Archive, ArrowRight, Check, FileText, LockKeyhole, MessageSquare, Send, Sparkles } from "lucide-react";
import { FormEvent, useState } from "react";
import { BrandSymbol } from "@/shared/components/brand-symbol";
import { useLocale } from "@/shared/i18n/locale-provider";
import { t } from "@/shared/i18n/messages";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const { locale } = useLocale();

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
    <section className="login-story" aria-label="RelayDesk 产品介绍">
      <div className="login-story-intro">
        <div className="login-wordmark"><span className="brand-mark"><BrandSymbol /></span><strong>RelayDesk</strong></div>
        <p className="login-kicker">TEAM AI WORKSPACE</p>
        <h1>{t(locale, "loginHero")}</h1>
        <p>{t(locale, "loginHeroDescription")}</p>
      </div>
      <div className="login-preview-grid" aria-hidden="true">
        <article className="login-conversation-preview">
          <header><span><MessageSquare size={16} /> {t(locale, "agentConversation")}</span><b><i />Hermes Agent {t(locale, "connected")}</b></header>
          <div className="preview-message preview-user"><span>王</span><p>请帮我整理本次需求评审的关键结论和后续行动项。</p><time>09:41</time></div>
          <div className="preview-message preview-agent"><span><Sparkles size={16} /></span><div><strong>Hermes Agent</strong><p>好的，以下是为你整理的要点：</p><ul><li>确认核心需求范围与优先级</li><li>技术方案采用分阶段交付策略</li><li>新增数据权限校验机制</li></ul><p>后续行动项</p><small><Check size={13} /> 完善 PRD 与流程图</small><small><Check size={13} /> 评估接口改造影响</small></div></div>
          <footer><span>向 Hermes Agent 发送消息…</span><button type="button"><Send size={16} /></button></footer>
        </article>
        <div className="login-preview-side">
          <article className="login-agent-preview"><h2>Hermes Agent</h2><span className="agent-ready"><i />已连接</span><p>响应正常，运行良好</p><button type="button">查看 Agent 状态 <ArrowRight size={16} /></button></article>
          <article className="login-archive-preview"><header><Archive size={17} />归档成果</header><div><span><FileText size={20} /></span><section><strong>需求评审会议纪要.md</strong><p>团队知识库 / 项目 Alpha</p><small>由 李明 归档于 2026-07-11</small></section></div><p>包含会议结论、行动项与相关讨论记录。</p><button type="button">查看详情 <ArrowRight size={16} /></button></article>
        </div>
      </div>
    </section>
    <section className="login-panel">
      <div className="login-card">
        <div className="login-brand"><span className="brand-mark"><BrandSymbol /></span><strong>RelayDesk</strong></div>
        <p className="eyebrow">内部团队工作台</p>
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
