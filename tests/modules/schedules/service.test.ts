import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDatabase } from "@/infrastructure/db/client";
import { createScheduleService } from "@/modules/schedules/service";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe("schedule service", () => {
  it("creates a planned entry without publishing content", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-schedule-")); directories.push(directory);
    const { sqlite } = createDatabase(path.join(directory, "relaydesk.db")); const now = Date.now();
    sqlite.prepare(`INSERT INTO content_records (id, conversation_id, source_message_id, title, body_markdown, status, created_by_operator_id, created_at, updated_at) VALUES ('content-1', 'conversation-1', 'message-1', '内容', '正文', 'draft', 'op', ?, ?)`).run(now, now);
    const entry = createScheduleService(sqlite).create({ contentRecordId: "content-1", scheduledAt: now + 86400000, operatorId: "op" });
    expect(entry.status).toBe("planned");
    expect(entry.conversationId).toBe("conversation-1");
    expect(sqlite.prepare(`SELECT status FROM content_records WHERE id = 'content-1'`).get()).toEqual({ status: "scheduled" });
    expect(createScheduleService(sqlite).updateStatus(entry.id, "completed", "other")).toBeUndefined();
    expect(createScheduleService(sqlite).updateStatus(entry.id, "completed", "op")?.status).toBe("completed");
    expect(sqlite.prepare(`SELECT status FROM content_records WHERE id = 'content-1'`).get()).toEqual({ status: "published" });
    sqlite.close();
  });
});
