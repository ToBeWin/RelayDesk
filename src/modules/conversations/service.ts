import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import type Database from "better-sqlite3";
import type {
  ChannelEvent,
  RuntimeAttachment,
} from "@/runtime/contracts/types";
import type { RuntimeConnector } from "@/runtime/contracts/runtime-connector";
import { createAssetService } from "@/modules/assets/service";

export type ConversationSummary = {
  id: string;
  title: string;
  runtimeConnectionId: string;
  contentAccountId: string | null;
  contentAccountName: string | null;
  externalSessionId: string;
  status: string;
  syncStatus: string;
  pinnedAt: number | null;
  createdAt: number;
  updatedAt: number;
};
export type PersistedAsset = {
  id: string;
  originalName: string | null;
  mimeType: string;
  sizeBytes: number;
  assetType: "image" | "file";
};
export type PersistedToolEvent = {
  id: string;
  name: string;
  preview?: string;
  duration?: number;
  isError?: boolean;
  status: "running" | "completed";
};
export type PersistedRuntimeEvent = {
  id: string;
  type: string;
  label: string;
  detail: string;
};
export type PersistedMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  status: string;
  contentText: string;
  taskKind: string;
  createdAt: number;
  operatorId: string | null;
  operatorName: string | null;
  assets: PersistedAsset[];
  tools: PersistedToolEvent[];
  events: PersistedRuntimeEvent[];
};

export function createConversationService(
  sqlite: Database.Database,
  connectorSource:
    | RuntimeConnector
    | ((runtimeConnectionId: string) => RuntimeConnector),
  runtimeAssetOptions?: { dataDir: string; runtimeSharedPaths: string[] },
) {
  const resolveConnector = (runtimeConnectionId: string) =>
    typeof connectorSource === "function"
      ? connectorSource(runtimeConnectionId)
      : connectorSource;
  const listMessages = (conversationId: string): PersistedMessage[] => {
    const messages = sqlite
      .prepare(
        `SELECT messages.id, messages.role, messages.status, messages.content_text as contentText, messages.task_kind as taskKind, messages.created_at as createdAt, messages.operator_id as operatorId, operators.name as operatorName FROM messages LEFT JOIN operators ON operators.id = messages.operator_id WHERE messages.conversation_id = ? ORDER BY messages.sequence_no`,
      )
      .all(conversationId) as Omit<
      PersistedMessage,
      "assets" | "tools" | "events"
    >[];
    const assets = sqlite.prepare(
      `SELECT id, original_name as originalName, mime_type as mimeType, size_bytes as sizeBytes, asset_type as assetType FROM assets WHERE message_id = ?`,
    );
    const toolRows = sqlite.prepare(
      `SELECT run_events.payload_json as payloadJson FROM run_events INNER JOIN runs ON runs.id = run_events.run_id WHERE runs.response_message_id = ? AND run_events.event_type IN ('tool.started', 'tool.completed') ORDER BY run_events.sequence_no`,
    );
    const eventRows = sqlite.prepare(
      `SELECT run_events.id, run_events.event_type as eventType, run_events.payload_json as payloadJson FROM run_events INNER JOIN runs ON runs.id = run_events.run_id WHERE runs.response_message_id = ? AND run_events.event_type IN ('approval.required', 'context.updated', 'runtime.unknown', 'run.failed') ORDER BY run_events.sequence_no`,
    );
    return messages.map((message) => {
      const byName = new Map<string, PersistedToolEvent>();
      for (const row of toolRows.all(message.id) as { payloadJson: string }[]) {
        try {
          const event = JSON.parse(row.payloadJson) as {
            type?: string;
            toolCall?: {
              id?: string;
              name?: string;
              preview?: string;
              duration?: number;
              isError?: boolean;
            };
          };
          const tool = event.toolCall;
          if (!tool?.name) continue;
          const current = byName.get(tool.name);
          byName.set(tool.name, {
            id: current?.id ?? tool.id ?? `${message.id}:${tool.name}`,
            name: tool.name,
            preview: tool.preview ?? current?.preview,
            duration: tool.duration ?? current?.duration,
            isError: tool.isError ?? current?.isError,
            status:
              event.type === "tool.completed"
                ? "completed"
                : (current?.status ?? "running"),
          });
        } catch {
          /* Corrupt raw events remain in SQLite but do not break chat rendering. */
        }
      }
      const events = (
        eventRows.all(message.id) as {
          id: string;
          eventType: string;
          payloadJson: string;
        }[]
      ).map((row): PersistedRuntimeEvent => {
        try {
          const payload = JSON.parse(row.payloadJson) as {
            approval?: { command?: string };
            usage?: Record<string, number>;
            name?: string;
            payload?: unknown;
            error?: { message?: string };
          };
          if (row.eventType === "approval.required")
            return {
              id: row.id,
              type: row.eventType,
              label: "需要批准",
              detail: payload.approval?.command || "Runtime 请求人工批准",
            };
          if (row.eventType === "context.updated")
            return {
              id: row.id,
              type: row.eventType,
              label: "上下文用量",
              detail: JSON.stringify(payload.usage ?? {}),
            };
          if (row.eventType === "run.failed")
            return {
              id: row.id,
              type: row.eventType,
              label: "运行失败",
              detail: payload.error?.message || "Runtime 运行失败",
            };
          return {
            id: row.id,
            type: row.eventType,
            label: `Runtime 事件 · ${payload.name || "unknown"}`,
            detail: JSON.stringify(payload.payload ?? payload),
          };
        } catch {
          return {
            id: row.id,
            type: row.eventType,
            label: "Runtime 原始事件",
            detail: row.payloadJson,
          };
        }
      });
      return {
        ...message,
        assets: assets.all(message.id) as PersistedAsset[],
        tools: [...byName.values()],
        events,
      };
    });
  };
  const conversationSelect = `SELECT conversations.id, conversations.title, conversations.runtime_connection_id as runtimeConnectionId, conversations.content_account_id as contentAccountId, content_accounts.name as contentAccountName, conversations.external_session_id as externalSessionId, conversations.status, conversations.sync_status as syncStatus, conversations.pinned_at as pinnedAt, conversations.created_at as createdAt, conversations.updated_at as updatedAt FROM conversations LEFT JOIN content_accounts ON content_accounts.id = conversations.content_account_id`;
  const getConversation = (
    conversationId: string,
  ): ConversationSummary | undefined =>
    sqlite
      .prepare(`${conversationSelect} WHERE conversations.id = ?`)
      .get(conversationId) as ConversationSummary | undefined;
  const getOwnedConversation = (
    conversationId: string,
    operatorId: string,
  ): ConversationSummary | undefined => {
    const conversation = getConversation(conversationId);
    return conversation &&
      sqlite
        .prepare(
          `SELECT 1 FROM conversations WHERE id = ? AND owner_operator_id = ? AND deleted_at IS NULL`,
        )
        .get(conversationId, operatorId)
      ? conversation
      : undefined;
  };

  return {
    async create(input: {
      title?: string;
      operatorId: string;
      runtimeConnectionId: string;
      contentAccountId?: string;
    }): Promise<ConversationSummary> {
      if (
        input.contentAccountId &&
        !sqlite
          .prepare(
            `SELECT 1 FROM content_accounts WHERE id = ? AND enabled = 1`,
          )
          .get(input.contentAccountId)
      )
        throw new Error("Content account not found");
      const connector = resolveConnector(input.runtimeConnectionId);
      const external = await connector.createSession({ title: input.title });
      const now = Date.now();
      const id = randomUUID();
      sqlite
        .prepare(
          `INSERT INTO conversations (id, runtime_connection_id, content_account_id, external_session_id, title, status, owner_operator_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
        )
        .run(
          id,
          input.runtimeConnectionId,
          input.contentAccountId ?? null,
          external.id,
          external.title,
          input.operatorId,
          now,
          now,
        );
      return getConversation(id)!;
    },
    list(operatorId: string): ConversationSummary[] {
      return sqlite
        .prepare(
          `${conversationSelect} WHERE conversations.owner_operator_id = ? AND conversations.deleted_at IS NULL ORDER BY conversations.pinned_at DESC, conversations.updated_at DESC`,
        )
        .all(operatorId) as ConversationSummary[];
    },
    get(conversationId: string, operatorId: string) {
      return getOwnedConversation(conversationId, operatorId);
    },
    rename(
      conversationId: string,
      title: string,
      operatorId?: string,
    ): ConversationSummary | undefined {
      if (operatorId && !getOwnedConversation(conversationId, operatorId))
        return undefined;
      sqlite
        .prepare(
          `UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?`,
        )
        .run(title.trim(), Date.now(), conversationId);
      return getConversation(conversationId);
    },
    setStatus(
      conversationId: string,
      status: "active" | "archived",
      operatorId?: string,
    ): ConversationSummary | undefined {
      if (operatorId && !getOwnedConversation(conversationId, operatorId))
        return undefined;
      sqlite
        .prepare(
          `UPDATE conversations SET status = ?, updated_at = ? WHERE id = ?`,
        )
        .run(status, Date.now(), conversationId);
      return getConversation(conversationId);
    },
    archive(conversationId: string): ConversationSummary | undefined {
      return this.setStatus(conversationId, "archived");
    },
    setPinned(conversationId: string, pinned: boolean, operatorId: string): ConversationSummary | undefined {
      if (!getOwnedConversation(conversationId, operatorId)) return undefined;
      const now = Date.now();
      sqlite.prepare(`UPDATE conversations SET pinned_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`).run(pinned ? now : null, now, conversationId);
      return getOwnedConversation(conversationId, operatorId);
    },
    delete(conversationId: string, operatorId: string): boolean {
      if (!getOwnedConversation(conversationId, operatorId)) return false;
      const now = Date.now();
      const result = sqlite.prepare(`UPDATE conversations SET deleted_at = ?, pinned_at = NULL, updated_at = ? WHERE id = ? AND owner_operator_id = ? AND deleted_at IS NULL`).run(now, now, conversationId, operatorId);
      return Boolean(result.changes);
    },
    listMessages(conversationId: string, operatorId?: string) {
      return operatorId && !this.get(conversationId, operatorId)
        ? []
        : listMessages(conversationId);
    },
    recoverStaleRuns(
      conversationId: string,
      operatorId: string,
      staleAfterMs = 5 * 60_000,
    ): number {
      if (!this.get(conversationId, operatorId)) return 0;
      const cutoff = Date.now() - staleAfterMs;
      const now = Date.now();
      const stale = sqlite
        .prepare(
          `SELECT id, response_message_id as responseMessageId FROM runs WHERE conversation_id = ? AND status IN ('pending', 'running') AND created_at < ?`,
        )
        .all(conversationId, cutoff) as {
        id: string;
        responseMessageId: string | null;
      }[];
      if (!stale.length) return 0;
      sqlite.transaction(() => {
        const failRun = sqlite.prepare(
          `UPDATE runs SET status = 'failed', error_code = 'STREAM_INTERRUPTED', error_message = '服务重启或连接中断', completed_at = ?, updated_at = ? WHERE id = ?`,
        );
        const interruptMessage = sqlite.prepare(
          `UPDATE messages SET status = 'interrupted', updated_at = ? WHERE id = ? AND status = 'streaming'`,
        );
        for (const run of stale) {
          failRun.run(now, now, run.id);
          if (run.responseMessageId)
            interruptMessage.run(now, run.responseMessageId);
        }
      })();
      return stale.length;
    },
    async syncFromRuntime(
      conversationId: string,
      operatorId: string,
    ): Promise<{ added: number; matched: number }> {
      const conversation = this.get(conversationId, operatorId);
      if (!conversation) throw new Error("Conversation not found");
      const now = Date.now();
      sqlite
        .prepare(
          `UPDATE conversations SET sync_status = 'syncing', updated_at = ? WHERE id = ?`,
        )
        .run(now, conversationId);
      try {
        const session = await resolveConnector(
          conversation.runtimeConnectionId,
        ).getSession(conversation.externalSessionId);
        let added = 0;
        let matched = 0;
        sqlite.transaction(() => {
          // Earlier Connector versions persisted the internal channel contract
          // returned by Hermes as a mirrored user message. It is never user
          // content, so remove only those synthetic runtime records.
          sqlite
            .prepare(
              `DELETE FROM messages WHERE conversation_id = ? AND local_client_id LIKE 'runtime:%' AND content_text LIKE '%[RelayDesk Channel Contract]%'`,
            )
            .run(conversationId);
          let sequence = (
            sqlite
              .prepare(
                `SELECT COALESCE(MAX(sequence_no), 0) as value FROM messages WHERE conversation_id = ?`,
              )
              .get(conversationId) as { value: number }
          ).value;
          const byExternal = sqlite.prepare(
            `SELECT id FROM messages WHERE conversation_id = ? AND external_message_id = ?`,
          );
          const byContent = sqlite.prepare(
            `SELECT id, external_message_id as externalMessageId FROM messages WHERE conversation_id = ? AND role = ? AND content_text = ? ORDER BY sequence_no DESC LIMIT 1`,
          );
          const linkExternal = sqlite.prepare(
            `UPDATE messages SET external_message_id = COALESCE(external_message_id, ?), external_created_at = COALESCE(external_created_at, ?), updated_at = ? WHERE id = ?`,
          );
          const insert = sqlite.prepare(
            `INSERT INTO messages (id, conversation_id, external_message_id, local_client_id, role, status, content_text, raw_json, sequence_no, external_created_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?)`,
          );
          for (const message of session.messages) {
            if (
              !message.text.trim() ||
              (message.role !== "user" &&
                message.role !== "assistant" &&
                message.role !== "system")
            )
              continue;
            if (byExternal.get(conversationId, message.id)) {
              matched += 1;
              continue;
            }
            const same = byContent.get(
              conversationId,
              message.role,
              message.text,
            ) as { id: string; externalMessageId: string | null } | undefined;
            if (same) {
              linkExternal.run(message.id, message.createdAt, now, same.id);
              matched += 1;
              continue;
            }
            sequence += 1;
            const id = randomUUID();
            insert.run(
              id,
              conversationId,
              message.id,
              `runtime:${message.id}`,
              message.role,
              message.text,
              JSON.stringify(message),
              sequence,
              message.createdAt,
              message.createdAt,
              now,
            );
            added += 1;
          }
          sqlite
            .prepare(
              `UPDATE conversations SET title = CASE WHEN title IN ('新建内容会话', 'New content chat') AND ? NOT IN ('未命名会话', 'Untitled chat') THEN ? ELSE title END, sync_status = 'idle', last_synced_at = ?, last_message_at = ?, updated_at = ? WHERE id = ?`,
            )
            .run(
              session.title,
              session.title,
              now,
              session.messages.at(-1)?.createdAt ?? now,
              now,
              conversationId,
            );
        })();
        return { added, matched };
      } catch (error) {
        sqlite
          .prepare(
            `UPDATE conversations SET sync_status = 'failed', last_synced_at = ?, updated_at = ? WHERE id = ?`,
          )
          .run(Date.now(), Date.now(), conversationId);
        throw error;
      }
    },
    async cancelLatest(
      conversationId: string,
      operatorId?: string,
    ): Promise<boolean> {
      const conversation = operatorId
        ? getOwnedConversation(conversationId, operatorId)
        : getConversation(conversationId);
      if (!conversation) return false;
      const connector = resolveConnector(conversation.runtimeConnectionId);
      const run = sqlite
        .prepare(
          `SELECT id, external_run_id as externalRunId FROM runs WHERE conversation_id = ? AND status IN ('pending', 'running') ORDER BY created_at DESC LIMIT 1`,
        )
        .get(conversationId) as
        | { id: string; externalRunId: string | null }
        | undefined;
      if (!run?.externalRunId || !connector.cancelRun) return false;
      await connector.cancelRun(run.externalRunId);
      sqlite
        .prepare(
          `UPDATE runs SET status = 'cancelled', completed_at = ?, updated_at = ? WHERE id = ?`,
        )
        .run(Date.now(), Date.now(), run.id);
      return true;
    },
    async *send(input: {
      conversationId: string;
      text: string;
      operatorId: string;
      taskKind?: string;
      attachmentAssetIds?: string[];
    }): AsyncIterable<ChannelEvent> {
      const conversation = getOwnedConversation(
        input.conversationId,
        input.operatorId,
      );
      if (!conversation) {
        yield {
          type: "run.failed",
          error: { code: "SESSION_NOT_FOUND", message: "会话不存在" },
        };
        return;
      }
      const runtimeAttachments: RuntimeAttachment[] = [];
      if (input.attachmentAssetIds?.length) {
        if (!runtimeAssetOptions) {
          yield {
            type: "run.failed",
            error: { code: "ATTACHMENT_REJECTED", message: "文件桥接未配置" },
          };
          return;
        }
        const assetService = createAssetService(
          sqlite,
          runtimeAssetOptions.dataDir,
        );
        for (const assetId of input.attachmentAssetIds) {
          const asset = assetService.getAuthorized(assetId, input.operatorId);
          if (!asset) {
            yield {
              type: "run.failed",
              error: {
                code: "ATTACHMENT_REJECTED",
                message: "附件不存在或已失效",
              },
            };
            return;
          }
          const localPath = assetService.resolvePath(asset);
          if (asset.mimeType.startsWith("image/"))
            runtimeAttachments.push({
              name: asset.originalName ?? "image",
              mimeType: asset.mimeType,
              localPath,
              dataUrl: `data:${asset.mimeType};base64,${(await fs.readFile(localPath)).toString("base64")}`,
            });
          else
            runtimeAttachments.push({
              name: asset.originalName ?? "file",
              mimeType: asset.mimeType,
              localPath,
            });
        }
      }
      const now = Date.now();
      const userMessageId = randomUUID();
      const runId = randomUUID();
      const sequence = (
        sqlite
          .prepare(
            `SELECT COALESCE(MAX(sequence_no), 0) as value FROM messages WHERE conversation_id = ?`,
          )
          .get(input.conversationId) as { value: number }
      ).value;
      // The Hermes runs API accepts a structured transcript; session_id only
      // correlates runs and does not itself restore short-term conversation state.
      const previousTurns = sqlite
        .prepare(
          `SELECT role, content_text as contentText FROM messages WHERE conversation_id = ? AND sequence_no <= ? AND status IN ('sent', 'completed') AND role IN ('user', 'assistant') ORDER BY sequence_no DESC LIMIT 24`,
        )
        .all(input.conversationId, sequence) as { role: "user" | "assistant"; contentText: string }[];
      const conversationHistory = previousTurns
        .reverse()
        .map((turn) => ({ role: turn.role, content: turn.contentText }))
        .filter((turn) => turn.content.trim())
        .slice(-24);
      const persistInitial = sqlite.transaction(() => {
        sqlite
          .prepare(
            `INSERT INTO messages (id, conversation_id, local_client_id, role, status, task_kind, content_text, sequence_no, operator_id, created_at, updated_at) VALUES (?, ?, ?, 'user', 'pending', ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            userMessageId,
            input.conversationId,
            userMessageId,
            input.taskKind ?? "chat",
            input.text,
            sequence + 1,
            input.operatorId,
            now,
            now,
          );
        sqlite
          .prepare(
            `INSERT INTO runs (id, conversation_id, request_message_id, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)`,
          )
          .run(runId, input.conversationId, userMessageId, now, now);
        for (const assetId of input.attachmentAssetIds ?? [])
          sqlite
            .prepare(
              `UPDATE assets SET conversation_id = ?, message_id = ?, owner_operator_id = ? WHERE id = ? AND source = 'upload' AND owner_operator_id = ?`,
            )
            .run(
              input.conversationId,
              userMessageId,
              input.operatorId,
              assetId,
              input.operatorId,
            );
      });
      persistInitial();
      let assistantMessageId: string | undefined;
      let assistantText = "";
      let eventNumber = 0;
      let lastDeltaPersistedAt = 0;
      const persistAssistantDelta = (force = false) => {
        const now = Date.now();
        if (!assistantMessageId || (!force && now - lastDeltaPersistedAt < 750))
          return;
        sqlite
          .prepare(
            `UPDATE messages SET content_text = ?, updated_at = ? WHERE id = ?`,
          )
          .run(assistantText, now, assistantMessageId);
        lastDeltaPersistedAt = now;
      };
      try {
        const connector = resolveConnector(conversation.runtimeConnectionId);
        for await (const event of connector.sendMessage({
          sessionId: conversation.externalSessionId,
          // Mirrors a native private channel: one durable memory lane per member
          // and Agent, while every RelayDesk conversation keeps its own transcript.
          memoryScope: `relaydesk:${conversation.runtimeConnectionId}:${input.operatorId}`,
          text: input.text,
          conversationHistory,
          attachments: runtimeAttachments,
        })) {
          if (event.type !== "message.delta") {
            eventNumber += 1;
            sqlite
              .prepare(
                `INSERT INTO run_events (id, run_id, sequence_no, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
              )
              .run(
                randomUUID(),
                runId,
                eventNumber,
                event.type,
                JSON.stringify(event),
                Date.now(),
              );
          }
          if (event.type === "run.started")
            sqlite
              .prepare(
                `UPDATE runs SET external_run_id = ?, status = 'running', started_at = ?, updated_at = ? WHERE id = ?`,
              )
              .run(event.runId, Date.now(), Date.now(), runId);
          if (event.type === "message.started") {
            assistantMessageId = randomUUID();
            sqlite
              .prepare(
                `INSERT INTO messages (id, conversation_id, external_message_id, local_client_id, role, status, task_kind, content_text, sequence_no, created_at, updated_at) VALUES (?, ?, ?, ?, 'assistant', 'streaming', ?, '', ?, ?, ?)`,
              )
              .run(
                assistantMessageId,
                input.conversationId,
                event.messageId,
                assistantMessageId,
                input.taskKind ?? "chat",
                sequence + 2,
                Date.now(),
                Date.now(),
              );
          }
          if (event.type === "message.delta") {
            assistantText += event.text;
            persistAssistantDelta();
          }
          if (event.type === "message.completed" && assistantMessageId) {
            assistantText = event.message.text;
            persistAssistantDelta(true);
            sqlite
              .prepare(
                `UPDATE messages SET content_text = ?, status = 'completed', raw_json = ?, updated_at = ? WHERE id = ?`,
              )
              .run(
                event.message.text,
                JSON.stringify(event.message),
                Date.now(),
                assistantMessageId,
              );
            if (runtimeAssetOptions) {
              const mediaPaths = [
                ...event.message.text.matchAll(/^MEDIA:\s*(.+?)\s*$/gm),
              ].map((match) => match[1]);
              for (const absolutePath of mediaPaths)
                await createAssetService(
                  sqlite,
                  runtimeAssetOptions.dataDir,
                ).archiveRuntimeFile({
                  absolutePath,
                  sharedRoots: runtimeAssetOptions.runtimeSharedPaths,
                  conversationId: input.conversationId,
                  messageId: assistantMessageId,
                  ownerOperatorId: input.operatorId,
                });
            }
          }
          if (event.type === "run.completed")
            sqlite
              .prepare(
                `UPDATE runs SET response_message_id = ?, status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?`,
              )
              .run(assistantMessageId ?? null, Date.now(), Date.now(), runId);
          if (event.type === "run.failed") {
            sqlite
              .prepare(
                `UPDATE runs SET response_message_id = ?, status = 'failed', error_code = ?, error_message = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
              )
              .run(
                assistantMessageId ?? null,
                event.error.code,
                event.error.message,
                Date.now(),
                Date.now(),
                runId,
              );
            if (assistantMessageId)
              sqlite
                .prepare(
                  `UPDATE messages SET status = 'interrupted', updated_at = ? WHERE id = ?`,
                )
                .run(Date.now(), assistantMessageId);
          }
          sqlite
            .prepare(
              `UPDATE messages SET status = 'sent', updated_at = ? WHERE id = ? AND status = 'pending'`,
            )
            .run(Date.now(), userMessageId);
          sqlite
            .prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`)
            .run(Date.now(), input.conversationId);
          yield event;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "运行时中断";
        persistAssistantDelta(true);
        sqlite
          .prepare(
            `UPDATE runs SET response_message_id = ?, status = 'failed', error_code = 'STREAM_INTERRUPTED', error_message = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
          )
          .run(
            assistantMessageId ?? null,
            message,
            Date.now(),
            Date.now(),
            runId,
          );
        if (assistantMessageId)
          sqlite
            .prepare(
              `UPDATE messages SET status = 'interrupted', updated_at = ? WHERE id = ?`,
            )
            .run(Date.now(), assistantMessageId);
        yield {
          type: "run.failed",
          error: { code: "STREAM_INTERRUPTED", message },
        };
      }
    },
  };
}
