"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ContentRecord } from "@/modules/contents/service";
import type { ScheduleEntry } from "@/modules/schedules/service";
import { useLocale } from "@/shared/i18n/locale-provider";

function toDateTimeLocal(timestamp: number) {
  const date = new Date(timestamp - new Date().getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

export default function SchedulePage() {
  const { locale } = useLocale();
  const l = (zh: string, en: string) => (locale === "zh-CN" ? zh : en);
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
      setError(l("请选择内容并填写计划时间", "Choose content and a scheduled time."));
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
      if (!response.ok) throw new Error(body.message ?? l("创建排期失败", "Could not create the schedule."));
      setItems((current) =>
        [...current, body].sort((a, b) => a.scheduledAt - b.scheduledAt),
      );
      setNotes("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : l("创建排期失败", "Could not create the schedule."));
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
      setError(l("更新排期状态失败", "Could not update the schedule status."));
      return;
    }
    const updated = await response.json();
    setItems((current) =>
      current.map((item) => (item.id === id ? updated : item)),
    );
  }
  const statusLabels: Record<string, string> = { planned: l("计划中", "Planned"), completed: l("已完成", "Completed"), cancelled: l("已取消", "Cancelled") };
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
          <p className="eyebrow">{l("内容排期", "CONTENT SCHEDULE")}</p>
          <h1>{l("发布计划", "Publishing plan")}</h1>
          <p className="muted">
            {l("排期用于协调内容准备，不会自动发布到任何内容平台。", "Schedules coordinate preparation only. RelayDesk never publishes to a content platform automatically.")}
          </p>
        </div>
        <span className="content-count">
          {visibleItems.length} / {items.length} {l("个计划", "plans")}
        </span>
      </div>
      <div className="library-filters">
        <input
          aria-label={l("搜索排期", "Search schedules")}
          placeholder={l("搜索内容标题或备注", "Search titles or notes")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label={l("按排期状态筛选", "Filter by schedule status")}
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="">{l("全部状态", "All statuses")}</option>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="schedule-workbench">
        <form className="schedule-form" onSubmit={create}>
          <p className="eyebrow">{l("新建排期", "NEW SCHEDULE")}</p>
          <label>
            {l("选择内容", "Choose content")}
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
                <option value="">{l("暂无可排期内容", "No content is available to schedule")}</option>
              )}
            </select>
          </label>
          <label>
            {l("计划时间", "Scheduled time")}
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              required
            />
          </label>
          <label>
            {l("备注", "Notes")}
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={l("例如：确认封面后交给运营发布", "For example: send to the publishing team after cover approval")}
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button
            className="primary-button"
            disabled={saving || !contents.length}
          >
            {saving ? l("正在保存...", "Saving…") : l("加入发布计划", "Add to publishing plan")}
          </button>
        </form>
        <div className="schedule-list">
          <div className="schedule-list-heading">
            <span>{l("内容与计划时间", "Content and scheduled time")}</span>
            <span>{l("状态", "Status")}</span>
            <span>{l("操作", "Actions")}</span>
          </div>
          {visibleItems.length ? (
            visibleItems.map((item) => (
              <article key={item.id} className="schedule-row">
                <div>
                  <strong>{item.title}</strong>
                  <time>
                    {new Date(item.scheduledAt).toLocaleString(locale)}
                  </time>
                  {item.notes ? <p>{item.notes}</p> : null}
                </div>
                <span className={`status-chip ${item.status}`}>
                  {statusLabels[item.status]}
                </span>
                <div className="schedule-actions">
                  <Link href={`/contents?content=${item.contentRecordId}`}>
                    {l("打开内容", "Open content")}
                  </Link>
                  <Link href={`/chat?conversation=${item.conversationId}`}>
                    {l("来源会话", "Source chat")}
                  </Link>
                  {item.status === "planned" ? (
                    <>
                      <button
                        onClick={() => updateStatus(item.id, "completed")}
                      >
                        {l("完成", "Complete")}
                      </button>
                      <button
                        onClick={() => updateStatus(item.id, "cancelled")}
                      >
                        {l("取消", "Cancel")}
                      </button>
                    </>
                  ) : (
                    <button onClick={() => updateStatus(item.id, "planned")}>
                      {l("恢复计划", "Restore plan")}
                    </button>
                  )}
                </div>
              </article>
            ))
          ) : (
            <div className="content-empty">
              {items.length
                ? l("没有符合筛选条件的排期。", "No schedules match the current filters.")
                : l("暂无排期。保存一条内容后，即可在左侧安排计划日期。", "No schedules yet. Save content first, then choose a date here.")}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
