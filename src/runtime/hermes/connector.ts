import { randomUUID } from "node:crypto";
import type { RuntimeConnector } from "@/runtime/contracts/runtime-connector";
import type { ChannelError, ChannelEvent, ChannelMessage, RuntimeCapabilities, RuntimeHealth, RuntimeInfo, RuntimeProfile, RuntimeSession, RuntimeSessionSummary, SendMessageInput } from "@/runtime/contracts/types";

type HermesConnectorOptions = { baseUrl: string; apiKey?: string; timeoutMs?: number; runtimeSharedPaths?: string[] };
type JsonRecord = Record<string, unknown>;

const defaultCapabilities: RuntimeCapabilities = {
  streaming: true, sessions: true, profiles: false, attachments: false,
  toolEvents: true, cancellation: true, compression: false, generatedAssets: false,
};

function toError(status: number, message: string): ChannelError {
  if (status === 401 || status === 403) return { code: "RUNTIME_AUTH_FAILED", message };
  if (status === 404) return { code: "SESSION_NOT_FOUND", message };
  if (status === 408 || status === 504) return { code: "RUN_TIMEOUT", message };
  if (status === 413 || status === 415) return { code: "ATTACHMENT_REJECTED", message };
  if (status >= 500) return { code: "RUNTIME_UNAVAILABLE", message };
  return { code: "UNKNOWN_RUNTIME_ERROR", message };
}

function asRecord(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function asString(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
function asNumber(value: unknown): number | undefined { return typeof value === "number" ? value : undefined; }
function stripRelayDeskInternalContext(text: string): string {
  return text
    .replace(/\n\n\[RelayDesk Channel Contract\][\s\S]*$/, "")
    .replace(/\n\n\[RelayDesk 受控附件\][\s\S]*$/, "");
}

export function createHermesConnector(options: HermesConnectorOptions): RuntimeConnector {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const runtimeHost = new URL(baseUrl).hostname;
  const isLocalRuntime = runtimeHost === "127.0.0.1" || runtimeHost === "localhost" || runtimeHost === "::1";
  const timeoutMs = options.timeoutMs ?? 120_000;
  const headers = () => ({ Accept: "application/json", ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}) });

  async function request(path: string, init?: RequestInit) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { ...headers(), ...init?.headers }, signal: controller.signal, cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const body = asRecord(payload);
        throw toError(response.status, asString(asRecord(body.error).message) ?? `Hermes request failed (${response.status})`);
      }
      return response;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw toError(408, "Hermes 请求超时");
      throw error;
    } finally { clearTimeout(timer); }
  }

  async function json(path: string, init?: RequestInit): Promise<JsonRecord> { return asRecord(await (await request(path, init)).json()); }

  return {
    type: "hermes",
    async getInfo(): Promise<RuntimeInfo> {
      const capabilities = await json("/v1/capabilities");
      return { name: "Hermes Agent", version: asString(capabilities.version) ?? "api-server", type: "hermes" };
    },
    async healthCheck(): Promise<RuntimeHealth> {
      try {
        const health = await json("/health");
        return { status: "healthy", message: asString(health.status) ?? "Hermes API Server is ready" };
      } catch (error) {
        const message = error && typeof error === "object" && "message" in error ? String(error.message) : "Hermes 不可用";
        return { status: "offline", message };
      }
    },
    async getCapabilities(): Promise<RuntimeCapabilities> {
      const capabilities = await json("/v1/capabilities");
      const features = asRecord(capabilities.features);
      return {
        ...defaultCapabilities,
        streaming: features.run_events_sse === true,
        sessions: features.session_resources === true,
        cancellation: features.run_stop === true,
        toolEvents: features.tool_progress_events === true,
        attachments: features.chat_completions === true,
      };
    },
    async listProfiles(): Promise<RuntimeProfile[]> { const payload = await json("/v1/models"); const rows = Array.isArray(payload.data) ? payload.data : []; return rows.map(asRecord).map((row) => ({ id: asString(row.id) ?? "", name: asString(row.name) ?? asString(row.id) ?? "Hermes Agent" })).filter((row) => row.id); },
    async listSessions(): Promise<RuntimeSessionSummary[]> {
      const payload = await json("/api/sessions");
      const rows = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.sessions) ? payload.sessions : [];
      return rows.map(asRecord).map((row) => ({ id: asString(row.id) ?? "", title: asString(row.title) ?? "未命名会话", createdAt: Math.round((asNumber(row.created_at) ?? Date.now() / 1000) * 1000) })).filter((row) => row.id);
    },
    async getSession(externalSessionId: string): Promise<RuntimeSession> {
      const [payload, messagePayload] = await Promise.all([json(`/api/sessions/${encodeURIComponent(externalSessionId)}`), json(`/api/sessions/${encodeURIComponent(externalSessionId)}/messages`)]);
      const session = asRecord(payload.session); const messages = Array.isArray(messagePayload.data) ? messagePayload.data : [];
      return {
        id: asString(session.id) ?? asString(payload.id) ?? externalSessionId,
        title: asString(session.title) ?? asString(payload.title) ?? "未命名会话",
        createdAt: Math.round((asNumber(session.started_at) ?? asNumber(payload.created_at) ?? Date.now() / 1000) * 1000),
        messages: messages.map(asRecord).map((message) => {
          const roleValue = asString(message.role); const role: ChannelMessage["role"] = roleValue === "assistant" || roleValue === "system" || roleValue === "tool" ? roleValue : "user";
          const text = stripRelayDeskInternalContext(asString(message.content) ?? "");
          return { id: String(message.id ?? randomUUID()), role, text, createdAt: Math.round((asNumber(message.timestamp) ?? asNumber(message.created_at) ?? Date.now() / 1000) * 1000) };
        }).filter((message) => message.text.trim() && message.role !== "tool"),
      };
    },
    async createSession(input): Promise<RuntimeSessionSummary> {
      let lastError: unknown;
      const displayTitle = input.title ?? "新建会话";
      let runtimeTitle = displayTitle;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const payload = await json("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: runtimeTitle }) });
          const session = asRecord(payload.session);
          return {
            id: asString(payload.id) ?? asString(payload.session_id) ?? asString(session.id) ?? randomUUID(),
            title: displayTitle,
            createdAt: Math.round((asNumber(payload.created_at) ?? asNumber(session.started_at) ?? Date.now() / 1000) * 1000),
          };
        } catch (error) {
          lastError = error;
          const duplicateTitle = Boolean(error && typeof error === "object" && "message" in error && String((error as { message?: string }).message).includes("already in use"));
          if (duplicateTitle) {
            runtimeTitle = `${displayTitle} · ${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
            continue;
          }
          const retryable = Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "RUNTIME_UNAVAILABLE");
          if (!retryable || attempt === 2) throw error;
          await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        }
      }
      throw lastError;
    },
    async *sendMessage(input: SendMessageInput): AsyncIterable<ChannelEvent> {
      const sharedPaths = options.runtimeSharedPaths?.length ? options.runtimeSharedPaths.join(", ") : "the RelayDesk configured shared directory";
      const relayDeskContract = `\n\n[RelayDesk Channel Contract]\nYou are responding inside RelayDesk, not Feishu, WeChat, Telegram, email, or any other external channel. Never invoke external messaging tools and never claim to have sent a message or file outside RelayDesk. The current chat transcript is isolated. You may use long-term memory only when it belongs to the current RelayDesk private member; never reveal or rely on another member's memory or conversation. When you create or locate a file that the user requested, copy it into one of these approved RelayDesk shared directories before replying: ${sharedPaths}. Return it through RelayDesk by including a separate line exactly in this form: MEDIA:/absolute/path/to/file. Do not return a bare path, and do not use a path outside the approved directories.\n`;
      const memoryHeaders: Record<string, string> = input.memoryScope ? { "X-Hermes-Session-Key": input.memoryScope } : {};
      const localAttachments = input.attachments?.filter((attachment) => attachment.localPath) ?? [];
      const remoteOnlyLocalAttachments = localAttachments.filter((attachment) => !attachment.dataUrl);
      if (remoteOnlyLocalAttachments.length && !isLocalRuntime) throw { code: "ATTACHMENT_REJECTED", message: "当前远程 Hermes 仅支持图片附件；文档需要与 RelayDesk 同机或配置共享目录" } satisfies ChannelError;
      const bridgedAttachments = isLocalRuntime ? localAttachments : [];
      const imageInstruction = bridgedAttachments.some((attachment) => attachment.mimeType.startsWith("image/"))
        ? "\n图片必须真实查看：请优先调用 vision_analyze；若视觉服务不可用，可使用其他本机工具读取图片，但必须如实说明降级情况。"
        : "";
      const attachmentManifest = bridgedAttachments.length ? `\n\n[RelayDesk 受控附件]\n${bridgedAttachments.map((attachment) => `- ${attachment.name}: ${attachment.localPath}`).join("\n")}\n请使用本机工具读取这些文件；不要只复述路径。${imageInstruction}` : "";
      if (!isLocalRuntime && input.attachments?.some((attachment) => attachment.dataUrl)) {
        const runId = randomUUID(); const messageId = `hermes_${runId}`;
        const content = [{ type: "text", text: `${input.text}${relayDeskContract}${attachmentManifest}` }, ...input.attachments.filter((attachment) => attachment.dataUrl).map((attachment) => ({ type: "image_url", image_url: { url: attachment.dataUrl! } }))];
        yield { type: "run.started", runId, sessionId: input.sessionId }; yield { type: "message.started", messageId, role: "assistant" };
        const payload = await json("/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", "X-Hermes-Session-Id": input.sessionId, ...memoryHeaders }, body: JSON.stringify({ model: "hermes-agent", messages: [{ role: "user", content }], stream: false }) });
        const choices = Array.isArray(payload.choices) ? payload.choices : []; const first = asRecord(choices[0]); const message = asRecord(first.message); const text = asString(message.content) ?? "";
        yield { type: "message.delta", messageId, text }; yield { type: "message.completed", message: { id: messageId, role: "assistant", text, createdAt: Date.now() }, raw: payload }; yield { type: "run.completed", runId, raw: payload }; return;
      }
      const started = await json("/v1/runs", { method: "POST", headers: { "Content-Type": "application/json", ...memoryHeaders }, body: JSON.stringify({ input: `${input.text}${relayDeskContract}${attachmentManifest}`, session_id: input.sessionId, conversation_history: input.conversationHistory }) });
      const runId = asString(started.run_id);
      if (!runId) throw toError(500, "Hermes 未返回 run_id");
      const messageId = `hermes_${runId}`;
      yield { type: "run.started", runId, sessionId: input.sessionId, raw: started };
      yield { type: "message.started", messageId, role: "assistant" };
      const response = await request(`/v1/runs/${encodeURIComponent(runId)}/events`, { headers: { Accept: "text/event-stream" } });
      if (!response.body) throw toError(502, "Hermes 未返回事件流");
      const decoder = new TextDecoder(); let buffered = ""; let completed = false;
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        buffered += decoder.decode(chunk, { stream: true });
        const frames = buffered.split(/\n\n/); buffered = frames.pop() ?? "";
        for (const frame of frames) {
          const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
          if (!data) continue;
          let raw: JsonRecord; try { raw = asRecord(JSON.parse(data)); } catch { continue; }
          const event = asString(raw.event);
          if (event === "message.delta") yield { type: "message.delta", messageId, text: asString(raw.delta) ?? "", raw };
          else if (event === "tool.started" || event === "tool.completed") yield { type: event, toolCall: { id: `${runId}:${event}:${asString(raw.tool) ?? "tool"}`, name: asString(raw.tool) ?? "tool", preview: asString(raw.preview), duration: asNumber(raw.duration), isError: raw.error === true }, raw };
          else if (event === "approval.request") yield { type: "approval.required", approval: { id: `${runId}:approval`, command: asString(raw.command), choices: Array.isArray(raw.choices) ? raw.choices.filter((choice): choice is string => typeof choice === "string") : [] }, raw };
          else if (event === "run.completed") { const text = asString(raw.output) ?? ""; const usage = asRecord(raw.usage); yield { type: "message.completed", message: { id: messageId, role: "assistant", text, createdAt: Date.now() }, raw }; yield { type: "context.updated", usage: Object.fromEntries(Object.entries(usage).filter((entry): entry is [string, number] => typeof entry[1] === "number")), raw }; yield { type: "run.completed", runId, raw }; completed = true; }
          else if (event === "run.failed" || event === "run.cancelled") { yield { type: "run.failed", runId, error: { code: event === "run.cancelled" ? "STREAM_INTERRUPTED" : "UNKNOWN_RUNTIME_ERROR", message: asString(raw.error) ?? "Hermes 运行失败" }, raw }; completed = true; }
          else yield { type: "runtime.unknown", name: event ?? "unknown", payload: raw, raw };
        }
      }
      if (!completed) throw toError(502, "Hermes 事件流在完成前中断");
    },
    async cancelRun(externalRunId: string): Promise<void> { await request(`/v1/runs/${encodeURIComponent(externalRunId)}/stop`, { method: "POST" }); },
  };
}
