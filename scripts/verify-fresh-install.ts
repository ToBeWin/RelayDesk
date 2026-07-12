import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDatabase } from "../src/infrastructure/db/client";

const root = mkdtempSync(path.join(tmpdir(), "relaydesk-fresh-install-"));

try {
  const { sqlite } = createDatabase(path.join(root, "relaydesk.db"));
  const tables = new Set(
    (sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[])
      .map((row) => row.name),
  );
  sqlite.close();

  for (const table of ["operators", "runtime_connections", "conversations", "messages", "runs", "run_events", "assets", "runtime_jobs", "app_settings"]) {
    if (!tables.has(table)) throw new Error(`Fresh install is missing required table: ${table}`);
  }
  for (const removedTable of ["content_accounts", "content_records", "content_reviews", "schedule_entries", "quick_actions"]) {
    if (tables.has(removedTable)) throw new Error(`Fresh install created removed public-core table: ${removedTable}`);
  }
  process.stdout.write("Fresh RelayDesk install verification passed.\n");
} finally {
  rmSync(root, { recursive: true, force: true });
}
