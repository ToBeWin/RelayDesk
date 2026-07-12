import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/infrastructure/config/env";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createMemberService } from "@/modules/members/service";

export const runtime = "nodejs";

const schema = z.object({
  dataDir: z.string().trim().min(1).max(1000),
  databasePath: z.string().trim().min(1).max(1000),
});

async function requireAdmin() {
  const operatorId = await getCurrentOperatorId();
  if (!operatorId) return null;
  const { sqlite } = createDatabase();
  try { return createMemberService(sqlite).isAdmin(operatorId) ? operatorId : null; }
  finally { sqlite.close(); }
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ message: "需要管理员权限" }, { status: 403 });
  return NextResponse.json({ dataDir: config.dataDir, databasePath: config.databasePath, storageConfigPath: config.storageConfigPath, restartRequired: false });
}

export async function PUT(request: Request) {
  const operatorId = await requireAdmin();
  if (!operatorId) return NextResponse.json({ message: "需要管理员权限" }, { status: 403 });
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ message: "存储路径不正确" }, { status: 400 });
  const dataDir = path.resolve(body.data.dataDir);
  const databasePath = path.resolve(body.data.databasePath);
  if (databasePath === dataDir || !path.extname(databasePath).toLowerCase().includes("db")) return NextResponse.json({ message: "SQLite 文件必须是独立的 .db 或 .sqlite 路径" }, { status: 400 });
  await mkdir(dataDir, { recursive: true });
  await mkdir(path.dirname(databasePath), { recursive: true });
  const temporary = `${config.storageConfigPath}.${randomUUID()}.tmp`;
  await mkdir(path.dirname(config.storageConfigPath), { recursive: true });
  await writeFile(temporary, `${JSON.stringify({ dataDir, databasePath }, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, config.storageConfigPath);
  const { sqlite } = createDatabase();
  try { sqlite.prepare("INSERT INTO audit_logs (id, operator_id, action, target_type, target_id, detail_json, created_at) VALUES (?, ?, 'storage.configuration.staged', 'system', NULL, ?, ?)").run(randomUUID(), operatorId, JSON.stringify({ dataDir, databasePath }), Date.now()); }
  finally { sqlite.close(); }
  return NextResponse.json({ dataDir, databasePath, restartRequired: true });
}
