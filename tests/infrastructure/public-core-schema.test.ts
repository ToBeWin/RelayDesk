import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDatabase } from "@/infrastructure/db/client";

const directories: string[] = [];

afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe("public-core database schema", () => {
  it("does not create retired content-workspace tables for a fresh installation", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-public-schema-"));
    directories.push(directory);
    const { sqlite } = createDatabase(path.join(directory, "relaydesk.db"));
    const retiredTables = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('content_accounts', 'content_records', 'content_reviews', 'schedule_entries', 'quick_actions')`).all();

    expect(retiredTables).toEqual([]);
    sqlite.close();
  });
});
