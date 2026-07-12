"use client";
/* eslint-disable @next/next/no-img-element */

import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import {
  Bot,
  Archive,
  CheckSquare2,
  Clock3,
  ChevronDown,
  Download,
  FileText,
  ImagePlus,
  LoaderCircle,
  Paperclip,
  ChevronLeft,
  ChevronRight,
  PencilLine,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  RotateCcw,
  SendHorizontal,
  Square,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { useSearchParams } from "next/navigation";
import type {
  ConversationSummary,
  PersistedMessage,
} from "@/modules/conversations/service";
import type { ContentAccount } from "@/modules/contents/service";
import { redactSensitiveDisplayText } from "@/shared/utils/redact-sensitive-display";
import { ConfirmDialog, TextPromptDialog } from "@/shared/components/confirm-dialog";
import { useToast } from "@/shared/components/toast-provider";
import { useLocale } from "@/shared/i18n/locale-provider";
import { t } from "@/shared/i18n/messages";

type StreamEvent = {
  type: string;
  text?: string;
  message?: { text: string };
  toolCall?: {
    id: string;
    name: string;
    preview?: string;
    duration?: number;
    isError?: boolean;
  };
};
type PendingAsset = {
  id: string;
  originalName: string | null;
  mimeType: string;
  sizeBytes: number;
  assetType: "image" | "file";
};
type AgentInstance = { id: string; name: string; workspaceLabel: string; profileName?: string; hostName?: string | null; sharingMode?: "shared" | "dedicated"; attachmentSupport?: "files" | "images_only"; permissions?: string[] };

export function ChatWorkspace() {
  const contentWorkspaceEnabled = false;
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<PersistedMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<PendingAsset[]>([]);
  const [running, setRunning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [runtimeName, setRuntimeName] = useState("Checking Runtime");
  const [runtimeAcceptsAttachments, setRuntimeAcceptsAttachments] =
    useState(false);
  const [agents, setAgents] = useState<AgentInstance[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [accounts, setAccounts] = useState<ContentAccount[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState("");
  const [savedContentMessageIds, setSavedContentMessageIds] = useState<Set<string>>(new Set());
  const [previewAsset, setPreviewAsset] = useState<PendingAsset | null>(null);
  const [previewText, setPreviewText] = useState("");
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [deleteConfirmConversation, setDeleteConfirmConversation] = useState<ConversationSummary | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [conversationRailCollapsed, setConversationRailCollapsed] = useState(() => typeof window !== "undefined" && window.localStorage.getItem("relaydesk:conversation-rail-collapsed") === "1");
  const [contentWorkbenchCollapsed, setContentWorkbenchCollapsed] = useState(() => typeof window !== "undefined" && window.localStorage.getItem("relaydesk:content-workbench-collapsed") === "1");
  const draftContextRef = useRef<string | undefined>(undefined);
  const { notify } = useToast();
  const { locale } = useLocale();
  const l = (zh: string, en: string) => (locale === "zh-CN" ? zh : en);
  const newConversationRequestedRef = useRef(false);
  const onNewConversationRequested = useEffectEvent(() => {
    void createConversation();
  });
  const refreshRuntimeHealth = useEffectEvent(() => {
    void loadRuntimeHealth();
  });

  useEffect(() => {
    void loadConversations();
    refreshRuntimeHealth();
    void loadAgents();
    void loadAccounts();
  }, []);
  useEffect(() => {
    refreshRuntimeHealth();
  }, [locale]);
  useEffect(() => {
    if (newConversationRequestedRef.current || agentsLoading || !agents.length || searchParams.get("new") !== "1") return;
    newConversationRequestedRef.current = true;
    window.history.replaceState({}, "", "/chat");
    onNewConversationRequested();
  }, [agentsLoading, agents, searchParams]);
  useEffect(() => {
    window.addEventListener("relaydesk:new-conversation", onNewConversationRequested);
    return () => window.removeEventListener("relaydesk:new-conversation", onNewConversationRequested);
  }, []);
  const onConversationSelected = useEffectEvent((id: string) => {
    void loadAndSync(id);
  });
  useEffect(() => {
    if (conversationId) onConversationSelected(conversationId);
  }, [conversationId, notify]);
  useEffect(() => {
    if (
      !conversationId ||
      !messages.some((message) => message.status === "streaming")
    )
      return;
    const timer = window.setInterval(() => {
      void loadMessages(conversationId);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [conversationId, messages]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!conversationId) {
        draftContextRef.current = undefined;
        setDraft("");
        setAttachments([]);
        return;
      }
      try {
        const saved = JSON.parse(
          window.localStorage.getItem(`relaydesk:draft:${conversationId}`) ??
            "{}",
        ) as { text?: string; attachments?: PendingAsset[] };
        setDraft(saved.text ?? "");
        setAttachments(
          Array.isArray(saved.attachments) ? saved.attachments : [],
        );
      } catch {
        setDraft("");
        setAttachments([]);
      }
      draftContextRef.current = conversationId;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [conversationId, notify]);
  useEffect(() => {
    if (!conversationId || draftContextRef.current !== conversationId) return;
    const timer = window.setTimeout(() => {
      if (draft.trim() || attachments.length)
        window.localStorage.setItem(
          `relaydesk:draft:${conversationId}`,
          JSON.stringify({ text: draft, attachments }),
        );
      else window.localStorage.removeItem(`relaydesk:draft:${conversationId}`);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [attachments, conversationId, draft]);
  useEffect(() => {
    const syncReminders = async () => {
      const response = await fetch("/api/reminders/sync", { method: "POST" });
      if (!response.ok) return;
      const result = await response.json() as { delivered?: number };
      if (!result.delivered) return;
      notify(`收到 ${result.delivered} 条 Hermes 定时任务提醒`, "info");
      if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("RelayDesk 定时任务提醒", { body: "Hermes 有新的定时任务结果，请查看当前会话。" });
      if (conversationId) { await loadMessages(conversationId); await loadConversations(); }
    };
    void syncReminders();
    const timer = window.setInterval(() => void syncReminders(), 30_000);
    return () => window.clearInterval(timer);
  }, [conversationId, notify]);

  async function loadRuntimeHealth() {
    const response = await fetch("/api/health");
    const health = response.ok ? await response.json() : null;
    setRuntimeName(
      health?.runtime?.type === "hermes"
        ? l("Hermes Agent 已连接", "Hermes Agent connected")
        : health?.runtime?.type === "mock"
          ? l("Mock Runtime 已连接", "Mock Runtime connected")
          : l("Runtime 未连接", "Runtime disconnected"),
    );
    setRuntimeAcceptsAttachments(
      Boolean(health?.runtime?.capabilities?.attachments),
    );
  }
  async function loadConversations() {
    const response = await fetch("/api/conversations");
    if (!response.ok) return;
    const items = (await response.json()) as ConversationSummary[];
    setConversations(items);
    const requested = new URLSearchParams(window.location.search).get(
      "conversation",
    );
    setConversationId(
      (current) =>
        current ??
        items.find((item) => item.id === requested && item.status === "active")
          ?.id ??
        items.find((item) => item.status === "active")?.id,
    );
  }
  async function loadAgents() {
    try {
      const response = await fetch("/api/agents");
      if (!response.ok) return;
      const items = ((await response.json()) as AgentInstance[]).filter((agent) => agent.permissions?.includes("chat"));
      setAgents(items);
      setSelectedAgentId((current) => current || items[0]?.id || "");
    } finally {
      setAgentsLoading(false);
    }
  }
  async function loadAccounts() {
    const response = await fetch("/api/accounts");
    if (!response.ok) return;
    const items = (await response.json()) as ContentAccount[];
    setAccounts(items);
    setSelectedAccountId((current) => current || items[0]?.id || "");
  }
  function chooseAccount(accountId: string) {
    setSelectedAccountId(accountId);
    const account = accounts.find((item) => item.id === accountId);
    if (
      account?.defaultRuntimeConnectionId &&
      agents.some((agent) => agent.id === account.defaultRuntimeConnectionId)
    )
      setSelectedAgentId(account.defaultRuntimeConnectionId);
  }
  function toggleConversationRail() {
    setConversationRailCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("relaydesk:conversation-rail-collapsed", next ? "1" : "0");
      return next;
    });
  }
  function toggleContentWorkbench() {
    setContentWorkbenchCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("relaydesk:content-workbench-collapsed", next ? "1" : "0");
      return next;
    });
  }
  async function createReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!conversationId) return;
    setReminderBusy(true); const form = new FormData(event.currentTarget);
    const response = await fetch("/api/reminders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId, name: form.get("name"), schedule: form.get("schedule"), prompt: form.get("prompt") }) });
    const result = await response.json(); setReminderBusy(false);
    if (!response.ok) return notify(result.message ?? "创建定时任务失败", "error");
    setReminderDialogOpen(false); notify("Hermes 定时任务已创建，到点后将回到这条私聊。", "success");
  }
  async function loadMessages(id: string) {
    const response = await fetch(`/api/conversations/${id}/messages`);
    if (response.ok) {
      const items = (await response.json()) as PersistedMessage[];
      setMessages(items);
      setRunning(items.some((message) => message.status === "streaming"));
    }
  }
  async function loadAndSync(id: string) {
    await loadMessages(id);
    setSyncing(true);
    try {
      const response = await fetch(`/api/conversations/${id}/sync`, {
        method: "POST",
      });
      if (response.ok) await loadMessages(id);
      else {
        const result = await response.json().catch(() => null) as { message?: string } | null;
        const message = result?.message ?? "同步失败；本地历史已保留，可稍后重试。";
        setError(message);
        notify(message, "error");
      }
    } catch {
      const message = "网络连接中断；RelayDesk 本地历史已保留，可稍后重试同步。";
      setError(message);
      notify(message, "error");
    } finally {
      setSyncing(false);
    }
  }
  function prepareRetry(index: number) {
    const previous = [...messages.slice(0, index)]
      .reverse()
      .find((message) => message.role === "user");
    if (!previous) return;
    setDraft(previous.contentText);
    setAttachments(previous.assets);
    setError("已恢复上一次输入和附件，确认后可重新发送。");
  }
  async function createConversationFor(agentId: string) {
    if (agentsLoading) return setError("正在加载 Agent，请稍候。");
    if (!agentId) return setError("当前没有可使用的 Agent，请联系管理员授权。");
    const account = accounts.find((item) => item.id === selectedAccountId);
    const response = await fetch("/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: account ? `${account.name} · ${l("新会话", "New chat")}` : l("新建内容会话", "New content chat"),
        runtimeConnectionId: agentId,
        contentAccountId: selectedAccountId || undefined,
      }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => null) as { message?: string } | null;
      const message = result?.message ?? "新建会话失败，请重试";
      setError(message);
      notify(message, "error");
      return;
    }
    const item = (await response.json()) as ConversationSummary;
    setConversations((items) => [item, ...items]);
    setConversationId(item.id);
    setMessages([]);
  }
  async function createConversation() { const agentId = selectedAgentId || agents[0]?.id; if (agentId) await createConversationFor(agentId); else setError("当前没有可使用的 Agent，请联系管理员授权。"); }
  async function switchAgent(agentId: string) {
    if (agentId === active?.runtimeConnectionId) return;
    setSelectedAgentId(agentId); setError(""); setShowArchived(false);
    const existing = conversations.find((item) => item.runtimeConnectionId === agentId && item.status === "active");
    if (existing) { setConversationId(existing.id); return; }
    await createConversationFor(agentId);
  }
  async function uploadAttachment(file: File) {
    const response = await fetch("/api/uploads", {
      method: "POST",
      headers: {
        "content-type": file.type,
        "content-length": String(file.size),
        "x-relaydesk-file-name": encodeURIComponent(file.name),
      },
      body: file,
    });
    const asset = await response.json();
    if (!response.ok) return setError(asset.message ?? "附件上传失败");
    setAttachments((items) => [...items, asset]);
  }
  async function uploadAttachments(files: FileList) {
    const selected = agents.find((agent) => agent.id === (active?.runtimeConnectionId ?? selectedAgentId));
    for (const file of Array.from(files).slice(0, 10)) {
      if (selected?.attachmentSupport === "images_only" && !file.type.startsWith("image/")) {
        const message = "当前远程 Agent 仅支持图片附件；文档需要与 RelayDesk 同机或配置共享目录。";
        setError(message); notify(message, "info"); continue;
      }
      await uploadAttachment(file);
    }
  }
  async function openPreview(asset: PendingAsset) {
    setPreviewAsset(asset);
    setPreviewText("");
    if (asset.mimeType.startsWith("text/")) {
      const response = await fetch(`/api/assets/${asset.id}`);
      setPreviewText(
        response.ok ? await response.text() : "文件内容加载失败。",
      );
    }
  }
  async function send(event?: FormEvent | KeyboardEvent<HTMLTextAreaElement>) {
    event?.preventDefault();
    if (!draft.trim() || !conversationId || running) return;
    const text = draft.trim();
    const attachmentAssetIds = attachments.map((asset) => asset.id);
    setError("");
    setRunning(true);
    setMessages((items) => [
      ...items,
      {
        id: `local-${Date.now()}`,
        role: "user",
        status: "sent",
        contentText: text,
        taskKind: "chat",
        createdAt: Date.now(),
        operatorId: null,
        operatorName: "我",
        assets: attachments,
        tools: [],
        events: [],
      },
      {
        id: "streaming",
        role: "assistant",
        status: "streaming",
        contentText: "",
        taskKind: "chat",
        createdAt: Date.now(),
        operatorId: null,
        operatorName: null,
        assets: [],
        tools: [],
        events: [],
      },
    ]);
    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, attachmentAssetIds }),
        },
      );
      if (!response.ok || !response.body) throw new Error("send failed");
      setDraft("");
      setAttachments([]);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        buffer += decoder.decode(result.value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const data = frame.replace(/^data: /, "");
          if (!data) continue;
          const item = JSON.parse(data) as StreamEvent;
          if (item.type === "message.delta")
            setMessages((items) =>
              items.map((message) =>
                message.id === "streaming"
                  ? {
                      ...message,
                      contentText: `${message.contentText}${item.text ?? ""}`,
                    }
                  : message,
              ),
            );
          if (
            (item.type === "tool.started" || item.type === "tool.completed") &&
            item.toolCall
          )
            setMessages((items) =>
              items.map((message) =>
                message.id === "streaming"
                  ? {
                      ...message,
                      tools: [
                        ...message.tools.filter(
                          (tool) => tool.name !== item.toolCall!.name,
                        ),
                        {
                          ...item.toolCall!,
                          status:
                            item.type === "tool.completed"
                              ? ("completed" as const)
                              : ("running" as const),
                        },
                      ],
                    }
                  : message,
              ),
            );
          if (item.type === "message.completed")
            setMessages((items) =>
              items.map((message) =>
                message.id === "streaming"
                  ? {
                      ...message,
                      status: "completed",
                      contentText: item.message?.text ?? message.contentText,
                    }
                  : message,
              ),
            );
          if (item.type === "run.failed")
            setError("运行时中断，已保留已接收内容。");
        }
      }
      await loadMessages(conversationId);
      await loadConversations();
    } catch {
      const message = "消息发送失败；已保留输入与附件，请检查 Hermes 状态后重试。";
      setError(message);
      notify(message, "error");
    } finally {
      setRunning(false);
    }
  }
  async function saveContent(messageId: string) {
    if (savedContentMessageIds.has(messageId)) return;
    const response = await fetch("/api/contents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
    if (!response.ok) { setError("保存内容失败，请稍后重试。"); notify("保存内容失败，请稍后重试。", "error"); }
    else { setSavedContentMessageIds((current) => new Set(current).add(messageId)); notify("已保存到内容中心。", "success"); }
  }
  async function stopRun() {
    if (!conversationId) return;
    const response = await fetch(`/api/conversations/${conversationId}/stop`, {
      method: "POST",
    });
    setError(
      response.ok
        ? "已请求停止 Runtime 任务，正在保留已接收内容。"
        : "当前任务无法停止，可能已经结束。",
    );
  }
  async function renameConversation() {
    if (!active) return;
    const title = renameTitle.trim();
    if (!title) return;
    const response = await fetch(`/api/conversations/${active.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!response.ok) { setError("重命名会话失败。"); notify("重命名会话失败，请稍后重试。", "error"); return; }
    const updated = (await response.json()) as ConversationSummary;
    setConversations((items) =>
      items.map((item) => (item.id === updated.id ? updated : item)),
    );
    setRenameDialogOpen(false);
    notify("会话名称已更新。", "success");
  }
  async function archiveConversation() {
    if (!active) return;
    const response = await fetch(`/api/conversations/${active.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    if (!response.ok) { setError("归档会话失败。"); notify("归档会话失败，请稍后重试。", "error"); return; }
    const updated = (await response.json()) as ConversationSummary;
    setConversations((items) =>
      items.map((item) => (item.id === updated.id ? updated : item)),
    );
    setShowArchived(true);
    setConversationId(updated.id);
    setArchiveConfirmOpen(false);
    notify("会话已归档。", "success");
  }
  async function archiveConversationFromList(conversation: ConversationSummary) {
    const response = await fetch(`/api/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    if (!response.ok) { notify("归档会话失败，请稍后重试。", "error"); return; }
    const updated = (await response.json()) as ConversationSummary;
    setConversations((items) => items.map((item) => item.id === updated.id ? updated : item));
    if (conversation.id === conversationId) {
      const next = conversations.find((item) => item.id !== conversation.id && item.status === "active");
      setConversationId(next?.id); setMessages([]);
    }
    notify("会话已归档。", "success");
  }
  async function restoreConversation() {
    if (!active) return;
    const response = await fetch(`/api/conversations/${active.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    if (!response.ok) return setError("恢复会话失败。");
    const updated = (await response.json()) as ConversationSummary;
    setConversations((items) =>
      items.map((item) => (item.id === updated.id ? updated : item)),
    );
    setShowArchived(false);
    setConversationId(updated.id);
  }
  async function restoreConversationFromList(conversation: ConversationSummary) {
    const response = await fetch(`/api/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    if (!response.ok) { notify("恢复会话失败，请稍后重试。", "error"); return; }
    const updated = (await response.json()) as ConversationSummary;
    setConversations((items) => items.map((item) => item.id === updated.id ? updated : item));
    setShowArchived(false); setConversationId(updated.id); notify("会话已恢复。", "success");
  }
  async function togglePinnedConversation(conversation: ConversationSummary) {
    const response = await fetch(`/api/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pinned: !conversation.pinnedAt }),
    });
    if (!response.ok) { notify("更新置顶状态失败，请稍后重试。", "error"); return; }
    const updated = (await response.json()) as ConversationSummary;
    setConversations((items) => [...items.map((item) => item.id === updated.id ? updated : item)].sort((left, right) => (Number(Boolean(right.pinnedAt)) - Number(Boolean(left.pinnedAt))) || right.updatedAt - left.updatedAt));
    notify(updated.pinnedAt ? "会话已置顶。" : "已取消置顶。", "success");
  }
  async function deleteConversation() {
    const conversation = deleteConfirmConversation; if (!conversation) return;
    const response = await fetch(`/api/conversations/${conversation.id}`, { method: "DELETE" });
    if (!response.ok) { notify("删除会话失败，请稍后重试。", "error"); return; }
    const remaining = conversations.filter((item) => item.id !== conversation.id);
    setConversations(remaining);
    if (conversation.id === conversationId) {
      const next = remaining.find((item) => item.status === (showArchived ? "archived" : "active"));
      setConversationId(next?.id); setMessages([]);
    }
    setDeleteConfirmConversation(null);
    notify("会话已从 RelayDesk 列表删除。", "success");
  }
  function toggleArchived() {
    const next = !showArchived;
    setShowArchived(next);
    const first = conversations.find(
      (item) => item.status === (next ? "archived" : "active"),
    );
    setConversationId(first?.id);
    if (!first) setMessages([]);
  }

  const active = conversations.find(
    (conversation) => conversation.id === conversationId,
  );
  const visibleConversations = conversations.filter(
    (conversation) =>
      conversation.status === (showArchived ? "archived" : "active") &&
      conversation.title
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  const latestAssistant = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === "assistant" && message.status === "completed",
    );
  const activeAgent = agents.find((agent) => agent.id === active?.runtimeConnectionId) ?? agents.find((agent) => agent.id === selectedAgentId);
  const canUploadToActiveAgent = runtimeAcceptsAttachments && Boolean(activeAgent?.permissions?.includes("upload"));
  const canManageActiveContent = contentWorkspaceEnabled && Boolean(activeAgent?.permissions?.includes("manage_content"));

  return (
    <section className={`chat-layout chat-live${conversationRailCollapsed ? " conversation-rail-collapsed" : ""}${contentWorkbenchCollapsed ? " content-workbench-collapsed" : ""}${contentWorkspaceEnabled ? "" : " content-workspace-disabled"}`}>
      {conversationRailCollapsed ? <button className="chat-panel-restore conversation-panel-restore" onClick={toggleConversationRail} aria-label={l("展开对话列表", "Expand chat list")} title={l("展开对话列表", "Expand chat list")} data-tooltip={l("展开对话列表", "Expand chat list")}><ChevronRight size={16} strokeWidth={2.25} /></button> : null}
      {contentWorkspaceEnabled && contentWorkbenchCollapsed ? <button className="chat-panel-restore content-panel-restore" onClick={toggleContentWorkbench} aria-label={l("展开内容工作台", "Expand content workspace")} title={l("展开内容工作台", "Expand content workspace")} data-tooltip={l("展开内容工作台", "Expand content workspace")}><ChevronLeft size={16} strokeWidth={2.25} /></button> : null}
      <button className="archive-toggle-overlay" onClick={toggleArchived}>
        {showArchived ? t(locale, "returnToCurrent") : t(locale, "viewArchive")}
      </button>
      <aside className="conversation-rail">
        <div className="rail-heading">
          <button className="rail-mode" onClick={toggleArchived}>
            {showArchived ? t(locale, "returnToCurrent") : t(locale, "viewArchive")}
          </button>
          <div className="rail-heading-actions">
            <button onClick={() => void createConversation()} aria-label={t(locale, "newConversation")} disabled={agentsLoading || !agents.length || showArchived} title={t(locale, "newConversation")}><Plus size={16} /></button>
            <button onClick={toggleConversationRail} aria-label={l("折叠对话列表", "Collapse chat list")} title={l("折叠对话列表", "Collapse chat list")}><ChevronLeft size={16} strokeWidth={2.25} /></button>
          </div>
        </div>
        <input
          className="conversation-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={showArchived ? t(locale, "searchArchivedChats") : t(locale, "searchChats")}
          aria-label={t(locale, "searchChats")}
        />
        {visibleConversations.length ? (
          visibleConversations.map((conversation) => (
            <article className={conversation.id === conversationId ? "conversation-row active" : "conversation-row"} key={conversation.id}>
              <button className="conversation-row-select" onClick={() => setConversationId(conversation.id)} aria-label={`打开会话：${conversation.title}`}>
                <span>{conversation.pinnedAt ? <Pin size={12} aria-label="已置顶" /> : null}{conversation.title}</span>
                <small>{new Date(conversation.updatedAt).toLocaleDateString(locale)}</small>
              </button>
              <div className="conversation-row-actions" aria-label={`${conversation.title} 操作`}>
                <button className="conversation-row-action" onClick={(event) => { event.stopPropagation(); void togglePinnedConversation(conversation); }} aria-label={conversation.pinnedAt ? t(locale, "unpin") : t(locale, "pin")} title={conversation.pinnedAt ? t(locale, "unpin") : t(locale, "pin")} data-tooltip={conversation.pinnedAt ? t(locale, "unpin") : t(locale, "pin")}>{conversation.pinnedAt ? <PinOff size={14} /> : <Pin size={14} />}</button>
                <button className="conversation-row-action" onClick={(event) => { event.stopPropagation(); void (conversation.status === "archived" ? restoreConversationFromList(conversation) : archiveConversationFromList(conversation)); }} aria-label={conversation.status === "archived" ? t(locale, "restore") : t(locale, "archive")} title={conversation.status === "archived" ? t(locale, "restore") : t(locale, "archive")} data-tooltip={conversation.status === "archived" ? t(locale, "restore") : t(locale, "archive")}>{conversation.status === "archived" ? <RotateCcw size={14} /> : <Archive size={14} />}</button>
                <button className="conversation-row-action danger" onClick={(event) => { event.stopPropagation(); setDeleteConfirmConversation(conversation); }} aria-label={t(locale, "delete")} title={t(locale, "delete")} data-tooltip={t(locale, "delete")}><Trash2 size={14} /></button>
              </div>
            </article>
          ))
        ) : showArchived ? (
          <p className="conversation-empty">{l("暂无归档会话", "No archived chats")}</p>
        ) : (
          <button
            className="conversation-empty"
            onClick={() => void createConversation()}
            disabled={agentsLoading || !agents.length}
          >
            {agentsLoading
              ? l("正在加载 Agent…", "Loading Agents…")
              : agents.length
                ? t(locale, "createFirstChat")
                : "暂无 Agent 授权"}
          </button>
        )}
      </aside>
      <div className="chat-canvas">
        <header className="page-header">
          <div>
            <p className="eyebrow">
              {active?.contentAccountName
                ? `内容账号 · ${active.contentAccountName}`
                : active?.status === "archived"
                  ? t(locale, "archivedChat")
                  : t(locale, "currentChat")}
              {syncing ? ` · ${t(locale, "syncing")} Hermes` : ""}
            </p>
            <h1>
              {active?.title ?? (showArchived ? t(locale, "archivedChat") : t(locale, "newConversation"))}
            </h1>
          </div>
          <div className="chat-header-actions">
            {active ? (
              active.status === "archived" ? (
                <button className="header-text-button" onClick={restoreConversation}>{l("恢复并继续", "Restore and continue")}</button>
              ) : (
                <div className="session-action-group" aria-label={l("会话操作", "Chat actions")}>
                  <button
                    className="toolbar-icon-button"
                    onClick={() => void loadAndSync(active.id)}
                    disabled={syncing}
                    aria-label={syncing ? l("正在同步会话", "Syncing chat") : l("同步会话", "Sync chat")}
                    title={syncing ? l("正在同步会话", "Syncing chat") : l("同步会话", "Sync chat")}
                    data-tooltip={syncing ? l("正在同步会话", "Syncing chat") : l("同步会话", "Sync chat")}
                  >
                    <RefreshCw className={syncing ? "is-spinning" : undefined} size={16} />
                  </button>
                  <button className="toolbar-icon-button" onClick={() => { setRenameTitle(active.title); setRenameDialogOpen(true); }} aria-label={l("重命名会话", "Rename chat")} title={l("重命名会话", "Rename chat")} data-tooltip={l("重命名会话", "Rename chat")}><PencilLine size={16} /></button>
                  <button className="toolbar-icon-button" onClick={() => setReminderDialogOpen(true)} aria-label={l("创建定时任务", "Create scheduled task")} title={l("创建定时任务", "Create scheduled task")} data-tooltip={l("创建定时任务", "Create scheduled task")}><Clock3 size={16} /></button>
                  <button className="toolbar-icon-button danger" onClick={() => setArchiveConfirmOpen(true)} aria-label={l("归档会话", "Archive chat")} title={l("归档会话", "Archive chat")} data-tooltip={l("归档会话", "Archive chat")}><Archive size={16} /></button>
                </div>
              )
            ) : null}
            {active && active.status !== "archived" ? <span className="header-toolbar-divider" aria-hidden="true" /> : null}
            {!active && !showArchived && accounts.length ? (
              <label className="agent-selector">
                {l("账号", "Account")}{" "}
                <select
                  value={selectedAccountId}
                  onChange={(event) => chooseAccount(event.target.value)}
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code} · {account.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {!showArchived && agents.length ? (
              <label className="agent-selector">
                <span><Bot size={15} />Agent</span>
                <select
                  value={active?.runtimeConnectionId ?? selectedAgentId}
                  onChange={(event) => void switchAgent(event.target.value)}
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                      {agent.profileName || agent.workspaceLabel ? ` · ${agent.profileName || agent.workspaceLabel}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <span className="runtime-status">
              <i />
            <span>{runtimeName}{activeAgent?.attachmentSupport === "images_only" ? ` · ${l("仅图片附件", "Images only")}` : ""}</span>
            </span>
          </div>
        </header>
        {messages.length ? (
          <div className="message-list">
            {messages.map((message, index) => (
              <article key={message.id} className={`message ${message.role}`}>
                <span className="message-avatar">
                  {message.role === "assistant" ? <Bot size={16} /> : l("你", "You")}
                </span>
                <div className="message-body">
                  <div className="message-meta">
                    <span>
                      {message.role === "assistant"
                        ? "Hermes Agent"
                        : message.operatorName || l("操作者", "Operator")}
                    </span>
                    <time>
                      {new Date(message.createdAt).toLocaleTimeString(locale, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                    {message.status === "streaming" ? (
                      <>
                        <LoaderCircle className="spin" size={14} />
                        <small>{l("运行中", "Running")}</small>
                      </>
                    ) : message.status === "interrupted" ||
                      message.status === "failed" ? (
                      <small className="message-failed">{l("连接已中断", "Connection interrupted")}</small>
                    ) : (
                      <small>
                        {message.status === "pending" ? l("发送中", "Sending") : l("已同步", "Synced")}
                      </small>
                    )}
                  </div>
                  {message.tools.length ? (
                    <div className="tool-events">
                      {message.tools.map((tool) => (
                        <details key={tool.id}>
                          <summary>
                            <Wrench size={13} />
                            <span>{tool.name}</span>
                            <small>
                              {tool.status === "running"
                                ? "运行中"
                                : tool.isError
                                  ? "失败"
                                  : tool.duration
                                    ? `${tool.duration.toFixed(1)}s`
                                    : "已完成"}
                            </small>
                            <ChevronDown size={13} />
                          </summary>
                          {tool.preview ? (
                            <pre>
                              {redactSensitiveDisplayText(tool.preview)}
                            </pre>
                          ) : null}
                        </details>
                      ))}
                    </div>
                  ) : null}
                  {message.events.length ? (
                    <div className="runtime-events">
                      {message.events.map((runtimeEvent) => (
                        <details key={runtimeEvent.id}>
                          <summary>
                            <span>{runtimeEvent.label}</span>
                            <ChevronDown size={13} />
                          </summary>
                          <pre>
                            {redactSensitiveDisplayText(runtimeEvent.detail)}
                          </pre>
                        </details>
                      ))}
                    </div>
                  ) : null}
                  {message.role === "assistant" ? (
                    <div className="message-markdown">
                      <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                        {redactSensitiveDisplayText(
                          message.contentText || l("正在思考…", "Thinking…"),
                        )}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p>{message.contentText || "正在发送…"}</p>
                  )}
                  {message.assets.length ? (
                    <div className="message-assets">
                      {message.assets.map((asset) =>
                        asset.assetType === "image" ? (
                          <button
                            className="message-image"
                            key={asset.id}
                            onClick={() => void openPreview(asset)}
                          >
                            <img
                              src={`/api/assets/${asset.id}`}
                              alt={asset.originalName ?? "图片附件"}
                            />
                          </button>
                        ) : (
                          <button
                            key={asset.id}
                            onClick={() => void openPreview(asset)}
                          >
                            <Paperclip size={13} />
                            {asset.originalName ?? "附件"}
                          </button>
                        ),
                      )}
                    </div>
                  ) : null}
                  {canManageActiveContent && message.role === "assistant" &&
                  message.status === "completed" ? (
                    <button
                      className="text-action"
                      onClick={() => saveContent(message.id)}
                      disabled={savedContentMessageIds.has(message.id)}
                    >
                      {savedContentMessageIds.has(message.id)
                        ? "已保存为内容"
                        : "保存为内容"}
                    </button>
                  ) : null}
                  {message.role === "assistant" &&
                  (message.status === "interrupted" ||
                    message.status === "failed") ? (
                    <button
                      className="text-action retry-action"
                      onClick={() => prepareRetry(index)}
                    >
                      <RotateCcw size={13} />
                      重新发送
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-chat">
            <span className="agent-icon">
              <Bot size={24} />
            </span>
            <h2>{l("从一个明确的内容目标开始", "Start with a clear goal")}</h2>
            <p>
              {l("选择账号、描述需求，RelayDesk 会将整个对话过程沉淀为可管理的工作成果。", "Choose an account and describe the work. RelayDesk turns the conversation into organized, reusable work.")}
            </p>
            <button
              className="primary-button"
              onClick={() => void createConversation()}
              disabled={agentsLoading || !agents.length}
            >
              {agentsLoading
                ? l("正在加载 Agent…", "Loading Agents…")
                : agents.length
                  ? t(locale, "newConversation")
                  : "暂无 Agent 授权"}
            </button>
          </div>
        )}
        <form className="composer" onSubmit={send}>
          <div className="composer-main">
            {attachments.length ? (
              <div className="attachment-chips">
                {attachments.map((asset) => (
                  <span key={asset.id}>
                    {asset.originalName ?? "附件"}
                    <button
                      type="button"
                      onClick={() =>
                        setAttachments((items) =>
                          items.filter((item) => item.id !== asset.id),
                        )
                      }
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <textarea
              aria-label={l("消息内容", "Message content")}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) void send(event); }}
              placeholder={
                active?.status === "archived"
                  ? l("请先恢复会话再继续", "Restore this chat before continuing")
                  : conversationId
                    ? t(locale, "messagePlaceholder")
                    : l("请先创建会话", "Create a chat first")
              }
              rows={2}
              disabled={
                !conversationId || active?.status === "archived" || running
              }
            />
          </div>
          <label
            className={
              canUploadToActiveAgent && active?.status !== "archived"
                ? "attach-button"
                : "attach-button disabled"
            }
            aria-label={
              canUploadToActiveAgent
                ? "添加附件"
                : "当前 Hermes 连接暂不支持附件"
            }
            title={
              canUploadToActiveAgent
                ? "添加附件"
                : "当前 Hermes 连接暂不支持附件转发"
            }
          >
            <Paperclip size={18} />
            <input
              type="file"
              multiple
              disabled={
                !canUploadToActiveAgent || active?.status === "archived"
              }
              onChange={(event) => {
                const files = event.target.files;
                if (files?.length) void uploadAttachments(files);
                event.currentTarget.value = "";
              }}
            />
          </label>
          {running ? (
            <button type="button" aria-label="停止运行" onClick={stopRun}>
              <Square size={16} />
            </button>
          ) : null}
          <button
            aria-label="发送消息"
            className="send-button"
            disabled={
              !conversationId ||
              active?.status === "archived" ||
              !draft.trim() ||
              running
            }
          >
            {running ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <SendHorizontal size={18} />
            )}
          </button>
        </form>
      </div>
      <aside className="utility-pane content-properties">
        <header>
          <p>{l("内容工作台", "Content workspace")}</p>
          <div className="utility-header-actions">
            <span>{latestAssistant ? l("可归档", "Ready to save") : l("等待回复", "Waiting for reply")}</span>
            <button onClick={toggleContentWorkbench} aria-label="折叠内容工作台" title="折叠内容工作台"><ChevronRight size={16} strokeWidth={2.25} /></button>
          </div>
        </header>
        <div className="content-status-card">
          <span className="agent-icon">
            <ImagePlus size={20} />
          </span>
          <div>
            <strong>{l("把可用回复沉淀为内容", "Save useful replies as content")}</strong>
            <p>{l("保存后可在内容库编辑标题、备注、状态、封面和排期。", "Edit the title, notes, status, cover, and schedule from the content library.")}</p>
          </div>
        </div>
        <div className="context-summary">
          <span>{l("内容账号", "Content account")}</span>
          <strong>
            {active?.contentAccountName ??
              accounts.find((item) => item.id === selectedAccountId)?.name ??
              l("未绑定账号", "No account selected")}
          </strong>
          <small>{active ? l("已随会话固定", "Fixed for this chat") : l("新会话将使用此账号", "New chats will use this account")}</small>
        </div>
        <div className="context-summary">
          <span>{t(locale, "currentChat")}</span>
          <strong>{active?.title ?? l("尚未创建会话", "No chat created")}</strong>
          <small>{runtimeName}</small>
        </div>
        <div className="context-summary">
          <span>{l("附件能力", "Attachment support")}</span>
          <strong>
            {canUploadToActiveAgent
              ? attachments.length
                ? `待发送 ${attachments.length} 个文件`
                : l("可发送文件到 Hermes", "Files can be sent to Hermes")
              : l("当前 Hermes 连接不支持附件转发", "This Hermes connection does not support attachments")}
          </strong>
          <small>
            {canUploadToActiveAgent
              ? l("上传后的文件会归档到 RelayDesk 本地存储。", "Uploaded files are archived in RelayDesk local storage.")
              : l("为避免误导，附件入口已关闭。", "The attachment control is disabled to avoid misleading results.")}
          </small>
        </div>
        <p className={error ? "property-hint error" : "property-hint"}>
          {error ||
            l("内容自检和封面工作流在内容库中发起，所有结果会回到这条真实会话。", "Content checks and cover workflows begin in the content library. Every result returns to this chat.")}
        </p>
        <div className="property-actions">
          <button
            className="review-button"
            disabled={!latestAssistant || !canManageActiveContent}
            onClick={() => setError("请先保存为内容，再在内容库发起自检。")}
          >
            <CheckSquare2 size={16} />
            {l("内容自检", "Content check")}
          </button>
          <button
            className="save-content-button"
            disabled={!latestAssistant || !canManageActiveContent}
            onClick={() => latestAssistant && saveContent(latestAssistant.id)}
          >
            <FileText size={16} />
            {l("保存为内容", "Save as content")}
          </button>
        </div>
      </aside>
      {previewAsset ? (
        <div
          className="asset-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="文件预览"
          onClick={() => setPreviewAsset(null)}
        >
          <section onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <strong>{previewAsset.originalName ?? "附件"}</strong>
                <small>
                  {previewAsset.mimeType} ·{" "}
                  {(previewAsset.sizeBytes / 1024).toFixed(1)} KB
                </small>
              </div>
              <div>
                <a href={`/api/assets/${previewAsset.id}`} download>
                  <Download size={16} />
                  下载
                </a>
                <button
                  aria-label="关闭预览"
                  onClick={() => setPreviewAsset(null)}
                >
                  <X size={18} />
                </button>
              </div>
            </header>
            {previewAsset.assetType === "image" ? (
              <img
                src={`/api/assets/${previewAsset.id}`}
                alt={previewAsset.originalName ?? "图片预览"}
              />
            ) : previewAsset.mimeType.startsWith("text/") ? (
              <pre className="asset-text-preview">
                {previewText || "正在加载文件内容…"}
              </pre>
            ) : previewAsset.mimeType === "application/pdf" ? (
              <iframe
                src={`/api/assets/${previewAsset.id}`}
                title={previewAsset.originalName ?? "文件预览"}
              />
            ) : previewAsset.mimeType.startsWith("audio/") ? (
              <audio controls src={`/api/assets/${previewAsset.id}`} />
            ) : previewAsset.mimeType.startsWith("video/") ? (
              <video controls src={`/api/assets/${previewAsset.id}`} />
            ) : (
              <div className="asset-no-preview">
                <FileText size={36} />
                <strong>此文件类型暂不支持浏览器内预览</strong>
                <p>文件已安全归档，可下载后使用本机应用打开。</p>
              </div>
            )}
          </section>
        </div>
      ) : null}
      <TextPromptDialog open={renameDialogOpen} title="重命名会话" description="会话历史和关联资产不会受到影响。" value={renameTitle} onChange={setRenameTitle} onConfirm={() => void renameConversation()} onCancel={() => setRenameDialogOpen(false)} />
      <ConfirmDialog open={archiveConfirmOpen} title="归档当前会话" description={`归档“${active?.title ?? "当前会话"}”后，仍可在历史记录中恢复。`} confirmLabel="确认归档" onConfirm={() => void archiveConversation()} onCancel={() => setArchiveConfirmOpen(false)} />
      <ConfirmDialog open={Boolean(deleteConfirmConversation)} title="从 RelayDesk 删除会话" description={`“${deleteConfirmConversation?.title ?? "此会话"}”将从你的 RelayDesk 列表隐藏。Hermes 原始会话与已归档资产不会被删除。`} confirmLabel="确认删除" destructive onConfirm={() => void deleteConversation()} onCancel={() => setDeleteConfirmConversation(null)} />
      {reminderDialogOpen ? <div className="confirm-backdrop"><form className="confirm-dialog reminder-dialog" onSubmit={createReminder}><header><span><Clock3 size={20} /></span><div><h2>创建 Hermes 定时任务</h2><p>完成结果会自动回到当前私聊。</p></div><button type="button" aria-label="关闭窗口" onClick={() => setReminderDialogOpen(false)}><X size={18} /></button></header><label className="dialog-field">任务名称<input name="name" autoFocus required placeholder="例如：晚餐提醒" /></label><label className="dialog-field">Cron 时间<input name="schedule" required placeholder="例如：38 20 * * *" /></label><label className="dialog-field">提醒内容<textarea name="prompt" required placeholder="例如：提醒我去吃饭。" /></label><footer><button type="button" className="secondary-button" onClick={() => setReminderDialogOpen(false)}>取消</button><button className="primary-button" disabled={reminderBusy}>{reminderBusy ? "正在创建" : "创建任务"}</button></footer></form></div> : null}
    </section>
  );
}
