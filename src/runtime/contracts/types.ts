export type RuntimeType = "hermes" | "openclaw" | "mock";

export type RuntimeCapabilities = { streaming: boolean; sessions: boolean; profiles: boolean; attachments: boolean; toolEvents: boolean; cancellation: boolean; compression: boolean; generatedAssets: boolean };
export type RuntimeInfo = { name: string; version: string; type: RuntimeType };
export type RuntimeHealth = { status: "healthy" | "degraded" | "offline"; message?: string };
export type RuntimeProfile = { id: string; name: string };
export type RuntimeSessionSummary = { id: string; title: string; createdAt: number };
export type RuntimeSession = RuntimeSessionSummary & { messages: ChannelMessage[] };
export type ChannelMessage = { id: string; role: "user" | "assistant" | "system" | "tool"; text: string; createdAt: number };
export type ChannelError = { code: "RUNTIME_UNAVAILABLE" | "RUNTIME_AUTH_FAILED" | "SESSION_NOT_FOUND" | "RUN_TIMEOUT" | "ATTACHMENT_REJECTED" | "STREAM_INTERRUPTED" | "UNKNOWN_RUNTIME_ERROR"; message: string };
export type ChannelEvent =
  | { type: "run.started"; runId: string; sessionId: string; raw?: unknown }
  | { type: "message.started"; messageId: string; role: "assistant"; raw?: unknown }
  | { type: "message.delta"; messageId: string; text: string; raw?: unknown }
  | { type: "message.completed"; message: ChannelMessage; raw?: unknown }
  | { type: "tool.started" | "tool.updated" | "tool.completed"; toolCall: { id: string; name: string; preview?: string; duration?: number; isError?: boolean }; raw?: unknown }
  | { type: "approval.required"; approval: { id: string; command?: string; choices: string[] }; raw?: unknown }
  | { type: "context.updated"; usage: Record<string, number>; raw?: unknown }
  | { type: "runtime.unknown"; name: string; payload: unknown; raw?: unknown }
  | { type: "run.completed"; runId: string; raw?: unknown }
  | { type: "run.failed"; runId?: string; error: ChannelError; raw?: unknown };

export type RuntimeAttachment = { name: string; mimeType: string; dataUrl?: string; localPath?: string };
export type SendMessageInput = {
  sessionId: string;
  /** Stable private-channel identity used by Hermes long-term memory providers. */
  memoryScope?: string;
  text: string;
  /** Short-term transcript supplied to the Runtime's native conversation API. */
  conversationHistory?: { role: "user" | "assistant"; content: string }[];
  profileId?: string;
  attachments?: RuntimeAttachment[];
};
