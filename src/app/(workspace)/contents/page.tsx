"use client";
/* eslint-disable @next/next/no-img-element -- controlled asset URLs require the browser's session cookie. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ExternalLink, Pencil, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import type { Asset } from "@/modules/assets/service";
import type {
  ContentAccount,
  ContentRecord,
  ContentReview,
} from "@/modules/contents/service";

const statuses = [
  "draft",
  "checking",
  "needs_revision",
  "ready",
  "scheduled",
  "published",
  "archived",
] as const;
const statusLabels: Record<string, string> = {
  draft: "草稿",
  checking: "自检中",
  needs_revision: "待修改",
  ready: "可发布",
  scheduled: "已排期",
  published: "已发布",
  archived: "已归档",
};

export default function ContentsPage() {
  const [items, setItems] = useState<ContentRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ContentReview[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [checking, setChecking] = useState(false);
  const [generatingCover, setGeneratingCover] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [coverResult, setCoverResult] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [title, setTitle] = useState("");
  const [bodyMarkdown, setBodyMarkdown] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("draft");
  const [accounts, setAccounts] = useState<ContentAccount[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/contents")
        .then((response) => (response.ok ? response.json() : []))
        .then((result: ContentRecord[]) => {
          setItems(result);
          const requestedId = new URLSearchParams(window.location.search).get(
            "content",
          );
          const requested = result.find((item) => item.id === requestedId);
          if (requested ?? result[0]) selectContent(requested ?? result[0]);
        });
      void fetch("/api/accounts")
        .then((response) => (response.ok ? response.json() : []))
        .then(setAccounts);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const active = items.find((item) => item.id === activeId) ?? null;
  const visibleItems = items.filter(
    (item) =>
      (!query.trim() ||
        `${item.title}\n${item.bodyMarkdown}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase())) &&
      (!statusFilter || item.status === statusFilter) &&
      (!accountFilter || item.contentAccountId === accountFilter),
  );

  function selectContent(item: ContentRecord) {
    setActiveId(item.id);
    setTitle(item.title);
    setBodyMarkdown(item.bodyMarkdown);
    setNotes(item.notes ?? "");
    setStatus(item.status);
    setEditing(false);
    setError("");
    setNotice("");
    setCoverResult("");
    void fetch(`/api/contents/${item.id}/review`)
      .then((response) => (response.ok ? response.json() : []))
      .then(setReviews);
    void fetch(`/api/contents/${item.id}/assets`)
      .then((response) => (response.ok ? response.json() : []))
      .then(setAssets);
  }
  async function save() {
    if (!active) return;
    setSaving(true);
    setError("");
    const response = await fetch(`/api/contents/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, bodyMarkdown, notes, status }),
    });
    const content = await response.json();
    setSaving(false);
    if (!response.ok) return setError(content.message ?? "保存失败");
    setItems((current) =>
      current.map((item) => (item.id === content.id ? content : item)),
    );
    setEditing(false);
    setNotice("内容修改已保存");
  }
  function cancelEdit() {
    if (!active) return;
    setTitle(active.title);
    setBodyMarkdown(active.bodyMarkdown);
    setNotes(active.notes ?? "");
    setStatus(active.status);
    setEditing(false);
  }
  async function selfCheck() {
    if (!active) return;
    setChecking(true);
    setError("");
    try {
      const response = await fetch(`/api/contents/${active.id}/review`, {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "内容自检失败");
      setReviews((current) => [
        {
          id: crypto.randomUUID(),
          contentRecordId: active.id,
          requestMessageId: "",
          responseMessageId: null,
          score: result.score,
          resultMarkdown: result.resultMarkdown,
          status: result.status,
          createdAt: Date.now(),
        },
        ...current,
      ]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "内容自检失败");
    } finally {
      setChecking(false);
    }
  }
  async function resyncContext() {
    if (!active) return;
    setResyncing(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/contents/${active.id}/resync`, {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "上下文同步失败");
      setNotice(result.resultMarkdown || "当前内容已同步到 Hermes。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "上下文同步失败");
    } finally {
      setResyncing(false);
    }
  }
  async function uploadCover(file: File) {
    if (!active) return;
    setUploading(true);
    setError("");
    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        headers: {
          "content-type": file.type,
          "content-length": String(file.size),
          "x-relaydesk-file-name": encodeURIComponent(file.name),
          "x-relaydesk-content-id": active.id,
        },
        body: file,
      });
      const asset = await response.json();
      if (!response.ok) throw new Error(asset.message ?? "图片上传失败");
      setAssets((current) => [asset, ...current]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "图片上传失败");
    } finally {
      setUploading(false);
    }
  }
  async function selectCover(assetId: string) {
    if (!active) return;
    const response = await fetch(`/api/contents/${active.id}/cover`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId }),
    });
    const content = await response.json();
    if (!response.ok) return setError(content.message ?? "选择封面失败");
    setItems((current) =>
      current.map((item) => (item.id === content.id ? content : item)),
    );
  }
  async function generateCover(mode: "generate" | "regenerate" = "generate") {
    if (!active) return;
    setGeneratingCover(true);
    setError("");
    try {
      const response = await fetch(
        `/api/contents/${active.id}/cover/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aspectRatio: "3:4", mode }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "封面生成请求失败");
      setCoverResult(
        result.resultMarkdown || "已向 Runtime 发送封面生成请求。",
      );
      const assetsResponse = await fetch(`/api/contents/${active.id}/assets`);
      if (assetsResponse.ok) setAssets(await assetsResponse.json());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "封面生成请求失败");
    } finally {
      setGeneratingCover(false);
    }
  }

  return (
    <section className="standard-page content-page">
      <div className="content-page-heading">
        <div>
          <p className="eyebrow">内容中心</p>
          <h1>内容库</h1>
          <p className="muted">完整保存、预览和管理 Agent 对话沉淀的内容。</p>
        </div>
        <span className="content-count">
          {visibleItems.length} / {items.length} 条内容
        </span>
      </div>
      <div className="library-filters">
        <input
          aria-label="搜索内容"
          placeholder="搜索标题或正文"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label="按状态筛选"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="">全部状态</option>
          {statuses.map((value) => (
            <option key={value} value={value}>
              {statusLabels[value]}
            </option>
          ))}
        </select>
        <select
          aria-label="按账号筛选"
          value={accountFilter}
          onChange={(event) => setAccountFilter(event.target.value)}
        >
          <option value="">全部账号</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.code} · {account.name}
            </option>
          ))}
        </select>
      </div>
      <div className="content-workbench">
        <div className="content-table">
          <div className="content-header">
            <span>内容</span>
            <span>状态</span>
            <span>更新时间</span>
          </div>
          {visibleItems.length ? (
            visibleItems.map((item) => (
              <button
                key={item.id}
                className={`content-row ${activeId === item.id ? "selected" : ""}`}
                onClick={() => selectContent(item)}
              >
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.bodyMarkdown.slice(0, 90)}</p>
                </div>
                <span className={`status-chip ${item.status}`}>
                  {statusLabels[item.status] ?? item.status}
                </span>
                <time>{new Date(item.updatedAt).toLocaleString("zh-CN")}</time>
              </button>
            ))
          ) : (
            <div className="content-empty">
              {items.length
                ? "没有符合筛选条件的内容。"
                : "暂无内容。请在聊天页将一条助手回复保存为内容。"}
            </div>
          )}
        </div>
        {active ? (
          <aside className="content-inspector">
            <div className="content-inspector-header">
              <div>
                <p className="eyebrow">内容工作台</p>
                <h2>{active.title}</h2>
              </div>
              {editing ? (
                <div>
                  <button aria-label="取消编辑" onClick={cancelEdit}>
                    <X size={15} />
                  </button>
                  <button
                    aria-label="保存内容"
                    onClick={save}
                    disabled={saving}
                  >
                    <Check size={15} />
                  </button>
                </div>
              ) : (
                <button aria-label="编辑内容" onClick={() => setEditing(true)}>
                  <Pencil size={15} />
                </button>
              )}
            </div>
            {notice ? <p className="content-notice">{notice}</p> : null}
            {editing ? (
              <div className="content-editor">
                <label>
                  标题
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>
                <label>
                  状态
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                  >
                    {statuses.map((value) => (
                      <option key={value} value={value}>
                        {statusLabels[value]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  正文 Markdown
                  <textarea
                    value={bodyMarkdown}
                    onChange={(event) => setBodyMarkdown(event.target.value)}
                  />
                </label>
                <label>
                  运营备注
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </label>
              </div>
            ) : (
              <>
                <div className="content-meta">
                  <span className={`status-chip ${active.status}`}>
                    {statusLabels[active.status] ?? active.status}
                  </span>
                  <Link href={`/chat?conversation=${active.conversationId}`}>
                    返回来源会话 <ExternalLink size={12} />
                  </Link>
                </div>
                <div className="content-markdown">
                  <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                    {active.bodyMarkdown}
                  </ReactMarkdown>
                </div>
                {active.notes ? (
                  <div className="content-notes">
                    <strong>运营备注</strong>
                    <p>{active.notes}</p>
                  </div>
                ) : null}
              </>
            )}
            <div className="inspector-section">
              <strong>封面</strong>
              <p className="content-inspector-copy">
                上传参考图或请求来源 Hermes Agent 生成，并选择最终封面。
              </p>
              <label className="asset-upload">
                {uploading ? "正在归档图片..." : "上传封面或参考图"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadCover(file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <button
                className="secondary-button"
                disabled={generatingCover}
                onClick={() => void generateCover("generate")}
              >
                {generatingCover ? "正在请求 Runtime..." : "使用参考图生成"}
              </button>
              <button
                className="secondary-button"
                disabled={generatingCover || !coverResult}
                onClick={() => void generateCover("regenerate")}
              >
                再生成一张
              </button>
              {coverResult ? (
                <div className="runtime-result">
                  <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                    {coverResult}
                  </ReactMarkdown>
                </div>
              ) : null}
              <div className="cover-grid">
                {assets.map((asset) => (
                  <article
                    key={asset.id}
                    className={`cover-candidate ${active.selectedCoverAssetId === asset.id ? "active" : ""}`}
                  >
                    <img
                      src={`/api/assets/${asset.id}`}
                      alt={asset.originalName ?? "候选封面"}
                    />
                    <button onClick={() => selectCover(asset.id)}>
                      {active.selectedCoverAssetId === asset.id
                        ? "当前最终封面"
                        : "设为最终封面"}
                    </button>
                  </article>
                ))}
              </div>
            </div>
            <div className="inspector-section">
              <strong>内容自检</strong>
              <p className="content-inspector-copy">
                将完整正文和真实账号定位发送给来源 Hermes
                Agent，并保存检查历史。
              </p>
              <button
                className="primary-button"
                disabled={checking}
                onClick={selfCheck}
              >
                {checking ? "正在自检..." : "发起内容自检"}
              </button>
              <button
                className="secondary-button"
                disabled={resyncing}
                onClick={resyncContext}
              >
                {resyncing ? "正在同步..." : "同步当前内容到 Hermes"}
              </button>
              {error ? <p className="form-error">{error}</p> : null}
              <div className="review-history">
                <strong>自检记录</strong>
                {reviews.length ? (
                  reviews.map((review) => (
                    <article key={review.id} className="review-card">
                      <div>
                        <span>发布前检查</span>
                        {review.score !== null ? (
                          <b>{review.score} 分</b>
                        ) : (
                          <small>未提取评分</small>
                        )}
                      </div>
                      <div className="review-markdown">
                        <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                          {review.resultMarkdown ||
                            "Runtime 未返回可展示的检查结果。"}
                        </ReactMarkdown>
                      </div>
                      <time>
                        {new Date(review.createdAt).toLocaleString("zh-CN")}
                      </time>
                    </article>
                  ))
                ) : (
                  <p className="muted">尚未自检。</p>
                )}
              </div>
            </div>
          </aside>
        ) : (
          <aside className="content-inspector empty">
            <p>选择一条内容查看完整正文。</p>
          </aside>
        )}
      </div>
    </section>
  );
}
