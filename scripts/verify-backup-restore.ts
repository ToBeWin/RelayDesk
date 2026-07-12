import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createBackup, restoreBackup } from "../src/infrastructure/backup/service";
import { createDatabase } from "../src/infrastructure/db/client";

const root = mkdtempSync(path.join(tmpdir(), "relaydesk-backup-restore-"));
const source = path.join(root, "source");
const restored = path.join(root, "restored");

async function main() {
try {
  mkdirSync(path.join(source, "uploads"), { recursive: true });
  mkdirSync(restored, { recursive: true });
  const { sqlite } = createDatabase(path.join(source, "relaydesk.db"));
  sqlite
    .prepare("INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)")
    .run("backup-proof", '{"value":"preserved"}', Date.now());
  sqlite.close();
  writeFileSync(path.join(source, "uploads", "proof.txt"), "RelayDesk backup proof");

  const backup = await createBackup(source);
  await restoreBackup(backup.directory, restored);
  const restoredDatabase = createDatabase(path.join(restored, "relaydesk.db")).sqlite;
  const proof = restoredDatabase
    .prepare("SELECT value_json as value FROM app_settings WHERE key = ?")
    .get("backup-proof") as { value?: string } | undefined;
  restoredDatabase.close();
  if (proof?.value !== '{"value":"preserved"}') throw new Error("Database proof was not restored");
  if (readFileSync(path.join(restored, "uploads", "proof.txt"), "utf8") !== "RelayDesk backup proof") throw new Error("Uploaded asset proof was not restored");
  process.stdout.write("RelayDesk backup and restore verification passed.\n");
} finally {
  rmSync(root, { recursive: true, force: true });
}
}

void main();
