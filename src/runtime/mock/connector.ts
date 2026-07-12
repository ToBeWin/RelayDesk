import { randomUUID } from "node:crypto";
import type { RuntimeConnector } from "@/runtime/contracts/runtime-connector";

export function createMockConnector(): RuntimeConnector {
  return {
    type: "mock",
    async getInfo() { return { name: "RelayDesk Mock Runtime", version: "1.0.0", type: "mock" }; },
    async healthCheck() { return { status: "healthy", message: "Mock runtime is ready" }; },
    async getCapabilities() { return { streaming: true, sessions: true, profiles: true, attachments: true, toolEvents: true, cancellation: false, compression: false, generatedAssets: false }; },
    async listProfiles() { return [{ id: "mock-default", name: "Mock Default" }]; },
    async listSessions() { return []; },
    async getSession(externalSessionId) { return { id: externalSessionId, title: "Mock session", createdAt: Date.now(), messages: [] }; },
    async createSession(input) { return { id: randomUUID(), title: input.title ?? "新建会话", createdAt: Date.now() }; },
    async *sendMessage(input) {
      const runId = randomUUID();
      const messageId = randomUUID();
      const text = `Mock Runtime 已收到：${input.text}`;
      yield { type: "run.started", runId, sessionId: input.sessionId };
      yield { type: "message.started", messageId, role: "assistant" };
      yield { type: "message.delta", messageId, text };
      yield { type: "message.completed", message: { id: messageId, role: "assistant", text, createdAt: Date.now() } };
      yield { type: "run.completed", runId };
    },
  };
}
