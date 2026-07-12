import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDatabase } from "@/infrastructure/db/client";
import { createContentService } from "@/modules/contents/service";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe("content service", () => {
  it("preserves the full markdown body when saving an assistant message", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-content-")); directories.push(directory);
    const { sqlite } = createDatabase(path.join(directory, "relaydesk.db"));
    const now = Date.now();
    sqlite.prepare(`INSERT INTO conversations (id, runtime_connection_id, external_session_id, title, status, owner_operator_id, created_at, updated_at) VALUES ('c1', 'mock', 's1', '会话', 'active', 'op1', ?, ?)`).run(now, now);
    sqlite.prepare(`INSERT INTO messages (id, conversation_id, local_client_id, role, status, content_text, sequence_no, created_at, updated_at) VALUES ('m1', 'c1', 'm1', 'assistant', 'completed', '# 内容标题\n\n完整正文', 1, ?, ?)`).run(now, now);
    const content = createContentService(sqlite).saveFromMessage({ messageId: "m1", operatorId: "op1" });
    expect(content.title).toBe("内容标题");
    expect(content.bodyMarkdown).toContain("完整正文");
    expect(createContentService(sqlite).saveFromMessage({ messageId: "m1", operatorId: "op1" }).id).toBe(content.id);
    expect(createContentService(sqlite).list()).toHaveLength(1);
    expect(() => createContentService(sqlite).saveFromMessage({ messageId: "m1", operatorId: "op2" })).toThrow("Only completed assistant messages");
    sqlite.close();
  });

  it("only selects an image asset as a final cover", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-content-")); directories.push(directory);
    const { sqlite } = createDatabase(path.join(directory, "relaydesk.db")); const now = Date.now();
    sqlite.prepare(`INSERT INTO content_records (id, conversation_id, source_message_id, title, body_markdown, status, created_at, updated_at) VALUES ('c1', 'v1', 'm1', '内容', '正文', 'draft', ?, ?)`).run(now, now);
    sqlite.prepare(`INSERT INTO assets (id, content_record_id, asset_type, source, stored_name, relative_path, mime_type, size_bytes, sha256, created_at) VALUES ('a1', 'c1', 'image', 'upload', 'x.png', 'uploads/x.png', 'image/png', 1, 'hash', ?)`).run(now);
    sqlite.prepare(`INSERT INTO assets (id, content_record_id, asset_type, source, stored_name, relative_path, mime_type, size_bytes, sha256, created_at) VALUES ('a2', 'other', 'image', 'upload', 'y.png', 'uploads/y.png', 'image/png', 1, 'hash2', ?)`).run(now);
    const service = createContentService(sqlite);
    expect(service.selectCover("c1", "a1")?.selectedCoverAssetId).toBe("a1");
    expect(() => service.selectCover("c1", "a2")).toThrow("attached to this content"); sqlite.close();
  });

  it("updates fields without losing a saved content body", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-content-update-")); directories.push(directory);
    const { sqlite } = createDatabase(path.join(directory, "relaydesk.db")); const now = Date.now();
    sqlite.prepare(`INSERT INTO content_records (id, conversation_id, source_message_id, title, body_markdown, status, created_at, updated_at) VALUES ('content-1', 'conversation-1', 'message-1', '原始标题', '完整正文', 'draft', ?, ?)`)
      .run(now, now);
    expect(createContentService(sqlite).update("content-1", { title: "更新标题", notes: "运营备注", status: "ready" })).toMatchObject({ title: "更新标题", notes: "运营备注", status: "ready", bodyMarkdown: "完整正文" });
    sqlite.close();
  });

  it("inherits the conversation content account when saving a reply", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-content-account-")); directories.push(directory);
    const { sqlite } = createDatabase(path.join(directory, "relaydesk.db")); const now = Date.now();
    sqlite.prepare(`INSERT INTO content_accounts (id, code, name, created_at, updated_at) VALUES ('account-1', '01', '品牌账号', ?, ?)`).run(now, now);
    sqlite.prepare(`INSERT INTO conversations (id, runtime_connection_id, content_account_id, external_session_id, title, status, owner_operator_id, created_at, updated_at) VALUES ('conversation-1', 'mock', 'account-1', 'session-1', '会话', 'active', 'operator-1', ?, ?)`).run(now, now);
    sqlite.prepare(`INSERT INTO messages (id, conversation_id, local_client_id, role, status, content_text, sequence_no, created_at, updated_at) VALUES ('message-1', 'conversation-1', 'message-1', 'assistant', 'completed', '账号内容', 1, ?, ?)`).run(now, now);
    expect(createContentService(sqlite).saveFromMessage({ messageId: "message-1", operatorId: "operator-1" }).contentAccountId).toBe("account-1"); sqlite.close();
  });

  it("updates and disables a content account without deleting it", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-account-update-")); directories.push(directory); const { sqlite } = createDatabase(path.join(directory, "relaydesk.db")); const service = createContentService(sqlite);
    const account = service.createAccount({ code: "01", name: "原名称", description: "原定位" });
    expect(service.updateAccount(account.id, { name: "新名称", notes: "运营备注" })).toMatchObject({ name: "新名称", notes: "运营备注" });
    expect(service.updateAccount(account.id, { enabled: false })?.enabled).toBeFalsy(); expect(service.listAccounts()).toHaveLength(0); expect(sqlite.prepare(`SELECT count(*) as count FROM content_accounts WHERE id = ?`).get(account.id)).toEqual({ count: 1 }); sqlite.close();
  });

  it("isolates saved content between private-chat operators", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-content-private-")); directories.push(directory); const { sqlite } = createDatabase(path.join(directory, "relaydesk.db")); const now = Date.now();
    sqlite.prepare(`INSERT INTO content_records (id, conversation_id, source_message_id, title, body_markdown, status, created_by_operator_id, created_at, updated_at) VALUES ('private-1', 'conversation-1', 'message-1', '私聊内容', '仅本人可见', 'draft', 'operator-1', ?, ?)`).run(now, now);
    const service = createContentService(sqlite);
    expect(service.listOwned("operator-1")).toHaveLength(1);
    expect(service.listOwned("operator-2")).toHaveLength(0);
    expect(service.getOwned("private-1", "operator-2")).toBeUndefined();
    expect(service.updateOwned("private-1", "operator-2", { title: "越权修改" })).toBeUndefined();
    expect(service.getOwned("private-1", "operator-1")?.title).toBe("私聊内容");
    sqlite.close();
  });
});
