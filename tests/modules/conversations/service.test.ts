import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDatabase } from "@/infrastructure/db/client";
import { createConversationService } from "@/modules/conversations/service";
import { createMockConnector } from "@/runtime/mock/connector";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe("conversation service", () => {
  it("persists both sides of a streamed runtime exchange", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-test-"));
    directories.push(directory);
    const { sqlite } = createDatabase(path.join(directory, "relaydesk.db"));
    const service = createConversationService(sqlite, createMockConnector());
    const conversation = await service.create({ title: "测试会话", operatorId: "operator-1", runtimeConnectionId: "mock-agent" });
    const events = [];
    for await (const event of service.send({ conversationId: conversation.id, text: "生成一条测试内容", operatorId: "operator-1" })) events.push(event.type);

    expect(events.at(-1)).toBe("run.completed");
    expect(service.listMessages(conversation.id).map((message) => message.role)).toEqual(["user", "assistant"]);
    sqlite.close();
  });

  it("cancels only the newest active runtime run for the selected conversation", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-cancel-"));
    directories.push(directory);
    const { sqlite } = createDatabase(path.join(directory, "relaydesk.db"));
    let cancelled = false; const connector = { ...createMockConnector(), cancelRun: async () => { cancelled = true; } };
    const service = createConversationService(sqlite, connector);
    const conversation = await service.create({ title: "可停止会话", operatorId: "operator-1", runtimeConnectionId: "mock-agent" }); const now = Date.now();
    sqlite.prepare(`INSERT INTO runs (id, conversation_id, external_run_id, status, created_at, updated_at) VALUES ('run-local', ?, 'run-hermes', 'running', ?, ?)`)
      .run(conversation.id, now, now);

    await expect(service.cancelLatest(conversation.id)).resolves.toBe(true);
    expect(cancelled).toBe(true);
    expect(sqlite.prepare(`SELECT status FROM runs WHERE id = 'run-local'`).get()).toEqual({ status: "cancelled" });
    sqlite.close();
  });

  it("renames and archives locally mirrored conversations", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-manage-")); directories.push(directory);
    const { sqlite } = createDatabase(path.join(directory, "relaydesk.db")); const service = createConversationService(sqlite, createMockConnector());
    const conversation = await service.create({ title: "原始标题", operatorId: "operator-1", runtimeConnectionId: "mock-agent" });
    expect(service.rename(conversation.id, "已重命名")?.title).toBe("已重命名");
    expect(service.archive(conversation.id)?.status).toBe("archived");
    expect(service.setStatus(conversation.id, "active")?.status).toBe("active");
    sqlite.close();
  });

  it("pins, archives, and soft-deletes only the owner's conversation", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-organize-")); directories.push(directory);
    const { sqlite } = createDatabase(path.join(directory, "relaydesk.db")); const service = createConversationService(sqlite, createMockConnector());
    const own = await service.create({ title: "我的会话", operatorId: "operator-a", runtimeConnectionId: "mock-agent" });
    const other = await service.create({ title: "其他会话", operatorId: "operator-b", runtimeConnectionId: "mock-agent" });
    expect(service.setPinned(own.id, true, "operator-a")?.pinnedAt).toBeTypeOf("number");
    expect(service.setPinned(own.id, true, "operator-b")).toBeUndefined();
    expect(service.setStatus(own.id, "archived", "operator-a")?.status).toBe("archived");
    expect(service.delete(own.id, "operator-a")).toBe(true);
    expect(service.get(own.id, "operator-a")).toBeUndefined();
    expect(service.list("operator-a")).toHaveLength(0);
    expect(service.get(other.id, "operator-b")?.title).toBe("其他会话");
    sqlite.close();
  });

  it("keeps private conversations out of another operator's list", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-private-")); directories.push(directory);
    const { sqlite } = createDatabase(path.join(directory, "relaydesk.db")); const service = createConversationService(sqlite, createMockConnector());
    const conversation = await service.create({ title: "私聊", operatorId: "operator-a", runtimeConnectionId: "mock-agent" });
    expect(service.list("operator-a")).toHaveLength(1);
    expect(service.list("operator-b")).toHaveLength(0);
    expect(service.get(conversation.id, "operator-b")).toBeUndefined();
    sqlite.close();
  });

  it("keeps transcripts per conversation but gives one member one durable Agent memory lane", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-memory-scope-")); directories.push(directory);
    const { sqlite } = createDatabase(path.join(directory, "relaydesk.db"));
    const scopes: string[] = [];
    const connector = { ...createMockConnector(), async *sendMessage(input: { sessionId: string; memoryScope?: string; text: string }) { scopes.push(`${input.sessionId}:${input.memoryScope}`); yield { type: "run.started" as const, runId: `run-${input.sessionId}`, sessionId: input.sessionId }; yield { type: "message.started" as const, messageId: `message-${input.sessionId}`, role: "assistant" as const }; yield { type: "message.completed" as const, message: { id: `message-${input.sessionId}`, role: "assistant" as const, text: "ok", createdAt: Date.now() } }; yield { type: "run.completed" as const, runId: `run-${input.sessionId}` }; } };
    const service = createConversationService(sqlite, connector);
    const first = await service.create({ title: "对话一", operatorId: "member-a", runtimeConnectionId: "agent-a" });
    const second = await service.create({ title: "对话二", operatorId: "member-a", runtimeConnectionId: "agent-a" });
    const other = await service.create({ title: "其他成员", operatorId: "member-b", runtimeConnectionId: "agent-a" });
    for await (const _event of service.send({ conversationId: first.id, text: "one", operatorId: "member-a" })) void _event;
    for await (const _event of service.send({ conversationId: second.id, text: "two", operatorId: "member-a" })) void _event;
    for await (const _event of service.send({ conversationId: other.id, text: "three", operatorId: "member-b" })) void _event;
    expect(scopes[0]?.split(":").slice(1).join(":")).toBe("relaydesk:agent-a:member-a");
    expect(scopes[1]?.split(":").slice(1).join(":")).toBe("relaydesk:agent-a:member-a");
    expect(scopes[2]?.split(":").slice(1).join(":")).toBe("relaydesk:agent-a:member-b");
    expect(first.externalSessionId).not.toBe(second.externalSessionId);
    sqlite.close();
  });

  it("blocks cross-operator mutations even when the conversation id is known", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-private-mutate-")); directories.push(directory);
    const { sqlite } = createDatabase(path.join(directory, "relaydesk.db"));
    const service = createConversationService(sqlite, createMockConnector());
    const conversation = await service.create({ title: "A 的私聊", operatorId: "operator-a", runtimeConnectionId: "mock-agent" });

    expect(service.rename(conversation.id, "B 改名", "operator-b")).toBeUndefined();
    expect(service.setStatus(conversation.id, "archived", "operator-b")).toBeUndefined();
    await expect(service.cancelLatest(conversation.id, "operator-b")).resolves.toBe(false);
    const events = [];
    for await (const event of service.send({ conversationId: conversation.id, text: "越权发送", operatorId: "operator-b" })) events.push(event);

    expect(events).toEqual([{ type: "run.failed", error: { code: "SESSION_NOT_FOUND", message: "会话不存在" } }]);
    expect(service.get(conversation.id, "operator-a")?.title).toBe("A 的私聊");
    expect(service.listMessages(conversation.id, "operator-a")).toHaveLength(0);
    sqlite.close();
  });

  it("marks abandoned runs and streaming messages as interrupted", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-recovery-")); directories.push(directory);
    const { sqlite } = createDatabase(path.join(directory, "relaydesk.db")); const service = createConversationService(sqlite, createMockConnector());
    const conversation = await service.create({ title: "断流会话", operatorId: "operator-a", runtimeConnectionId: "mock-agent" }); const old = Date.now() - 10 * 60_000;
    sqlite.prepare(`INSERT INTO messages (id, conversation_id, local_client_id, role, status, content_text, sequence_no, created_at, updated_at) VALUES ('assistant-stale', ?, 'assistant-stale', 'assistant', 'streaming', '部分回复', 1, ?, ?)`).run(conversation.id, old, old);
    sqlite.prepare(`INSERT INTO runs (id, conversation_id, response_message_id, status, created_at, updated_at) VALUES ('run-stale', ?, 'assistant-stale', 'running', ?, ?)`).run(conversation.id, old, old);
    expect(service.recoverStaleRuns(conversation.id, "operator-a")).toBe(1);
    expect(service.listMessages(conversation.id)[0].status).toBe("interrupted");
    expect(sqlite.prepare(`SELECT status, error_code as errorCode FROM runs WHERE id = 'run-stale'`).get()).toEqual({ status: "failed", errorCode: "STREAM_INTERRUPTED" });
    sqlite.close();
  });

  it("merges runtime history idempotently without duplicating local messages", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-sync-")); directories.push(directory);
    const { sqlite } = createDatabase(path.join(directory, "relaydesk.db"));
    const connector = { ...createMockConnector(), getSession: async (id: string) => ({ id, title: "Runtime 标题", createdAt: 1, messages: [
      { id: "external-user", role: "user" as const, text: "本地问题", createdAt: 10 },
      { id: "external-assistant", role: "assistant" as const, text: "Runtime 最终回答", createdAt: 20 },
    ] }) };
    const service = createConversationService(sqlite, connector); const conversation = await service.create({ title: "同步会话", operatorId: "operator-a", runtimeConnectionId: "mock-agent" }); const now = Date.now();
    sqlite.prepare(`INSERT INTO messages (id, conversation_id, local_client_id, role, status, content_text, sequence_no, created_at, updated_at) VALUES ('local-user', ?, 'local-user', 'user', 'sent', '本地问题', 1, ?, ?)`).run(conversation.id, now, now);
    sqlite.prepare(`INSERT INTO messages (id, conversation_id, local_client_id, role, status, content_text, sequence_no, created_at, updated_at) VALUES ('legacy-contract', ?, 'runtime:legacy-contract', 'user', 'completed', '本地问题\n\n[RelayDesk Channel Contract]\ninternal protocol', 2, ?, ?)`).run(conversation.id, now, now);
    await expect(service.syncFromRuntime(conversation.id, "operator-a")).resolves.toEqual({ added: 1, matched: 1 });
    await expect(service.syncFromRuntime(conversation.id, "operator-a")).resolves.toEqual({ added: 0, matched: 2 });
    expect(service.listMessages(conversation.id).map((message) => message.contentText)).toEqual(["本地问题", "Runtime 最终回答"]);
    expect(sqlite.prepare(`SELECT external_message_id as externalMessageId FROM messages WHERE id = 'local-user'`).get()).toEqual({ externalMessageId: "external-user" });
    sqlite.close();
  });

  it("marks a failed runtime sync without deleting the local message mirror", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-sync-failed-")); directories.push(directory);
    const { sqlite } = createDatabase(path.join(directory, "relaydesk.db"));
    const connector = { ...createMockConnector(), async getSession() { throw { code: "RUNTIME_UNAVAILABLE", message: "Hermes offline" }; } };
    const service = createConversationService(sqlite, connector);
    const conversation = await service.create({ title: "本地历史", operatorId: "operator-a", runtimeConnectionId: "mock-agent" }); const now = Date.now();
    sqlite.prepare(`INSERT INTO messages (id, conversation_id, local_client_id, role, status, content_text, sequence_no, created_at, updated_at) VALUES ('local-message', ?, 'local-message', 'assistant', 'completed', '已归档的本地历史', 1, ?, ?)`)
      .run(conversation.id, now, now);
    await expect(service.syncFromRuntime(conversation.id, "operator-a")).rejects.toMatchObject({ code: "RUNTIME_UNAVAILABLE" });
    expect(service.listMessages(conversation.id, "operator-a")).toMatchObject([{ contentText: "已归档的本地历史" }]);
    expect(service.get(conversation.id, "operator-a")?.syncStatus).toBe("failed");
    sqlite.close();
  });

  it("persists connector run failures instead of leaving runs active", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-run-failed-")); directories.push(directory); const { sqlite } = createDatabase(path.join(directory, "relaydesk.db"));
    const connector = { ...createMockConnector(), async *sendMessage(input: { sessionId: string }) { yield { type: "run.started" as const, runId: "external-run", sessionId: input.sessionId }; yield { type: "message.started" as const, messageId: "external-message", role: "assistant" as const }; yield { type: "run.failed" as const, runId: "external-run", error: { code: "UNKNOWN_RUNTIME_ERROR" as const, message: "provider failed" } }; } };
    const service = createConversationService(sqlite, connector); const conversation = await service.create({ title: "失败会话", operatorId: "operator-a", runtimeConnectionId: "mock-agent" });
    for await (const event of service.send({ conversationId: conversation.id, text: "触发失败", operatorId: "operator-a" })) void event;
    expect(sqlite.prepare(`SELECT status, error_message as errorMessage FROM runs WHERE conversation_id = ?`).get(conversation.id)).toEqual({ status: "failed", errorMessage: "provider failed" });
    const assistant = service.listMessages(conversation.id).find((message) => message.role === "assistant"); expect(assistant?.status).toBe("interrupted"); expect(assistant?.events[0]).toMatchObject({ type: "run.failed", detail: "provider failed" }); expect(assistant?.events[0]).not.toHaveProperty("label"); sqlite.close();
  });

  it("archives Hermes MEDIA paths whose filenames contain spaces", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-media-path-")); directories.push(directory);
    const shared = path.join(directory, "shared files"); mkdirSync(shared, { recursive: true });
    const runtimeFile = path.join(shared, "封面 图片.png"); writeFileSync(runtimeFile, "png-content");
    const { sqlite } = createDatabase(path.join(directory, "relaydesk.db"));
    const connector = { ...createMockConnector(), async *sendMessage(input: { sessionId: string }) { yield { type: "run.started" as const, runId: "run-media", sessionId: input.sessionId }; yield { type: "message.started" as const, messageId: "message-media", role: "assistant" as const }; yield { type: "message.completed" as const, message: { id: "message-media", role: "assistant" as const, text: `已生成文件。\nMEDIA:${runtimeFile}`, createdAt: Date.now() } }; yield { type: "run.completed" as const, runId: "run-media" }; } };
    const service = createConversationService(sqlite, connector, { dataDir: path.join(directory, "data"), runtimeSharedPaths: [shared] });
    const conversation = await service.create({ title: "媒体文件", operatorId: "operator-a", runtimeConnectionId: "mock-agent" });
    for await (const _event of service.send({ conversationId: conversation.id, text: "生成文件", operatorId: "operator-a" })) void _event;
    const assistant = service.listMessages(conversation.id, "operator-a").find((message) => message.role === "assistant");
    expect(assistant?.assets).toMatchObject([{ originalName: "封面 图片.png", mimeType: "image/png" }]);
    sqlite.close();
  });
});
