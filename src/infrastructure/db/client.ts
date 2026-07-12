import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { config } from "@/infrastructure/config/env";
import * as schema from "@/infrastructure/db/schema";
import { applyMigrations } from "@/infrastructure/db/migrations";

export function createDatabase(databasePath = config.databasePath) {
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("busy_timeout = 5000");
  applyMigrations(sqlite);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}
