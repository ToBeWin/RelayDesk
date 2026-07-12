import { NextResponse } from "next/server";
import { z } from "zod";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createMemberService } from "@/modules/members/service";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
const createSchema = z.object({ name: z.string().trim().min(1).max(40), password: z.string().min(8).max(128), role: z.enum(["admin", "member"]).default("member") });

export async function GET() {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const { sqlite } = createDatabase(); try { const members = createMemberService(sqlite); if (!members.isAdmin(operatorId)) return NextResponse.json({ message: "需要管理员权限" }, { status: 403 });
  return NextResponse.json(members.list()); } finally { sqlite.close(); }
}

export async function POST(request: Request) {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const body = createSchema.safeParse(await request.json().catch(() => null)); if (!body.success) return NextResponse.json({ message: "成员信息不正确，密码至少 8 位" }, { status: 400 });
  const { sqlite } = createDatabase(); try { const members = createMemberService(sqlite); if (!members.isAdmin(operatorId)) return NextResponse.json({ message: "需要管理员权限" }, { status: 403 });
  try { const member = await members.create(body.data); sqlite.prepare(`INSERT INTO audit_logs (id, operator_id, action, target_type, target_id, detail_json, created_at) VALUES (?, ?, 'member.created', 'operator', ?, ?, ?)`).run(randomUUID(), operatorId, member.id, JSON.stringify({ name: member.name, role: member.role }), Date.now()); return NextResponse.json(member, { status: 201 }); } catch { return NextResponse.json({ message: "成员名称已存在" }, { status: 409 }); } } finally { sqlite.close(); }
}
