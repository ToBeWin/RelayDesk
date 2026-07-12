import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDatabase } from "@/infrastructure/db/client";
import { createBackup, restoreBackup, verifyBackup } from "@/infrastructure/backup/service";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe("backup and restore", () => {
  it("restores a verified SQLite snapshot and archived files", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "relaydesk-backup-")); directories.push(root);
    const source = path.join(root, "source"); const restored = path.join(root, "restored"); mkdirSync(path.join(source, "uploads"), { recursive: true }); mkdirSync(restored, { recursive: true });
    const { sqlite } = createDatabase(path.join(source, "relaydesk.db")); sqlite.prepare(`INSERT INTO app_settings (key, value_json, updated_at) VALUES ('proof', '{"value":"original"}', ?)`).run(Date.now()); sqlite.close();
    writeFileSync(path.join(source, "uploads", "file.txt"), "asset");
    const backup = await createBackup(source); await expect(verifyBackup(backup.directory)).resolves.toEqual(backup.manifest);
    await restoreBackup(backup.directory, restored);
    const restoredDb = createDatabase(path.join(restored, "relaydesk.db")).sqlite;
    expect(restoredDb.prepare(`SELECT value_json as value FROM app_settings WHERE key = 'proof'`).get()).toEqual({ value: '{"value":"original"}' }); restoredDb.close();
    expect(readFileSync(path.join(restored, "uploads", "file.txt"), "utf8")).toBe("asset");
  });

  it("rejects a backup whose archived asset was modified", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "relaydesk-backup-tamper-")); directories.push(root); mkdirSync(path.join(root, "uploads"), { recursive: true });
    const { sqlite } = createDatabase(path.join(root, "relaydesk.db")); sqlite.close(); writeFileSync(path.join(root, "uploads", "file.txt"), "asset");
    const backup = await createBackup(root); writeFileSync(path.join(backup.directory, "uploads", "file.txt"), "tampered");
    await expect(verifyBackup(backup.directory)).rejects.toThrow("checksum mismatch");
  });
});
