import { NextResponse } from "next/server";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createMemberService } from "@/modules/members/service";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 }); const limit = Math.min(200, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 50));
  const { sqlite } = createDatabase(); try { if (!createMemberService(sqlite).isAdmin(operatorId)) return NextResponse.json({ message: "需要管理员权限" }, { status: 403 }); return NextResponse.json(sqlite.prepare(`SELECT audit_logs.id, audit_logs.action, audit_logs.target_type as targetType, audit_logs.target_id as targetId, audit_logs.detail_json as detailJson, audit_logs.created_at as createdAt, operators.name as operatorName FROM audit_logs LEFT JOIN operators ON operators.id = audit_logs.operator_id ORDER BY audit_logs.created_at DESC LIMIT ?`).all(limit)); } finally { sqlite.close(); }
}
