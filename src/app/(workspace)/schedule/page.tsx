"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ContentRecord } from "@/modules/contents/service";
import type { ScheduleEntry } from "@/modules/schedules/service";

function toDateTimeLocal(timestamp: number) {
  const date = new Date(timestamp - new Date().getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

export default function SchedulePage() {
  const [items, setItems] = useState<ScheduleEntry[]>([]);
  const [contents, setContents] = useState<ContentRecord[]>([]);
  const [contentId, setContentId] = useState("");
  const [scheduledAt, setScheduledAt] = useState(() =>
    toDateTimeLocal(Date.now() + 86_400_000),
  );
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const load = () => {
    void fetch("/api/schedules")
      .then((response) => (response.ok ? response.json() : []))
      .then(setItems);
    void fetch("/api/contents")
      .then((response) => (response.ok ? response.json() : []))
      .then((result: ContentRecord[]) => {
        setContents(result);
        setContentId((current) => current || result[0]?.id || "");
      });
  };
  useEffect(load, []);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const when = new Date(scheduledAt).getTime();
    if (!contentId || Number.isNaN(when)) {
      setError("请选择内容并填写计划时间");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentRecordId: contentId,
          scheduledAt: when,
          notes: notes || undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "创建排期失败");
      setItems((current) =>
        [...current, body].sort((a, b) => a.scheduledAt - b.scheduledAt),
      );
      setNotes("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "创建排期失败");
    } finally {
      setSaving(false);
    }
  }
  async function updateStatus(id: string, status: ScheduleEntry["status"]) {
    const response = await fetch(`/api/schedules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      setError("更新排期状态失败");
      return;
    }
    const updated = await response.json();
    setItems((current) =>
      current.map((item) => (item.id === id ? updated : item)),
    );
  }
  const statusLabels: Record<string, string> = {
    planned: "计划中",
    completed: "已完成",
    cancelled: "已取消",
  };
  const visibleItems = items.filter(
    (item) =>
      (!query.trim() ||
        `${item.title}\n${item.notes ?? ""}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase())) &&
      (!statusFilter || item.status === statusFilter),
  );
  return (
    <section className="standard-page schedule-page">
      <div className="content-page-heading">
        <div>
          <p className="eyebrow">内容排期</p>
          <h1>发布计划</h1>
          <p className="muted">
            排期用于协调内容准备，不会自动发布到任何内容平台。
          </p>
        </div>
        <span className="content-count">
          {visibleItems.length} / {items.length} 个计划
        </span>
      </div>
      <div className="library-filters">
        <input
          aria-label="搜索排期"
          placeholder="搜索内容标题或备注"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label="按排期状态筛选"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="">全部状态</option>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="schedule-workbench">
        <form className="schedule-form" onSubmit={create}>
          <p className="eyebrow">新建排期</p>
          <label>
            选择内容
            <select
              value={contentId}
              onChange={(event) => setContentId(event.target.value)}
            >
              {contents.length ? (
                contents.map((content) => (
                  <option key={content.id} value={content.id}>
                    {content.title}
                  </option>
                ))
              ) : (
                <option value="">暂无可排期内容</option>
              )}
            </select>
          </label>
          <label>
            计划时间
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              required
            />
          </label>
          <label>
            备注
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="例如：确认封面后交给运营发布"
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button
            className="primary-button"
            disabled={saving || !contents.length}
          >
            {saving ? "正在保存..." : "加入发布计划"}
          </button>
        </form>
        <div className="schedule-list">
          <div className="schedule-list-heading">
            <span>内容与计划时间</span>
            <span>状态</span>
            <span>操作</span>
          </div>
          {visibleItems.length ? (
            visibleItems.map((item) => (
              <article key={item.id} className="schedule-row">
                <div>
                  <strong>{item.title}</strong>
                  <time>
                    {new Date(item.scheduledAt).toLocaleString("zh-CN")}
                  </time>
                  {item.notes ? <p>{item.notes}</p> : null}
                </div>
                <span className={`status-chip ${item.status}`}>
                  {statusLabels[item.status]}
                </span>
                <div className="schedule-actions">
                  <Link href={`/contents?content=${item.contentRecordId}`}>
                    打开内容
                  </Link>
                  <Link href={`/chat?conversation=${item.conversationId}`}>
                    来源会话
                  </Link>
                  {item.status === "planned" ? (
                    <>
                      <button
                        onClick={() => updateStatus(item.id, "completed")}
                      >
                        完成
                      </button>
                      <button
                        onClick={() => updateStatus(item.id, "cancelled")}
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <button onClick={() => updateStatus(item.id, "planned")}>
                      恢复计划
                    </button>
                  )}
                </div>
              </article>
            ))
          ) : (
            <div className="content-empty">
              {items.length
                ? "没有符合筛选条件的排期。"
                : "暂无排期。保存一条内容后，即可在左侧安排计划日期。"}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
