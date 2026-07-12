import { NextResponse } from "next/server";
import { config } from "@/infrastructure/config/env";
import { createBackup } from "@/infrastructure/backup/service";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createMemberService } from "@/modules/members/service";
import { randomUUID } from "node:crypto";
import { logError } from "@/infrastructure/logging/logger";
export const runtime = "nodejs";
export async function POST() { const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 }); const { sqlite } = createDatabase(); try { if (!createMemberService(sqlite).isAdmin(operatorId)) return NextResponse.json({ message: "需要管理员权限" }, { status: 403 }); } finally { sqlite.close(); } try { const backup = await createBackup(config.dataDir); const { sqlite: auditSqlite } = createDatabase(); try { auditSqlite.prepare(`INSERT INTO audit_logs (id, operator_id, action, target_type, target_id, detail_json, created_at) VALUES (?, ?, 'backup.created', 'backup', ?, ?, ?)`).run(randomUUID(), operatorId, backup.directory, JSON.stringify({ fileCount: backup.manifest.files.length, createdAt: backup.manifest.createdAt }), Date.now()); } finally { auditSqlite.close(); } return NextResponse.json({ directory: backup.directory, manifest: backup.manifest }, { status: 201 }); } catch (error) { logError("backup.create.failed", error, { operatorId }); return NextResponse.json({ message: "备份失败" }, { status: 500 }); } }
