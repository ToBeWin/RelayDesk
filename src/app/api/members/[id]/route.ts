import { NextResponse } from "next/server";
import { z } from "zod";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createMemberService } from "@/modules/members/service";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
const schema = z.object({ active: z.boolean().optional(), password: z.string().min(8).max(128).optional() }).refine((value) => value.active !== undefined || value.password !== undefined, "至少提供一个更新字段");

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const body = schema.safeParse(await request.json().catch(() => null)); if (!body.success) return NextResponse.json({ message: "成员更新参数不正确" }, { status: 400 });
  const { sqlite } = createDatabase(); try { const members = createMemberService(sqlite); if (!members.isAdmin(operatorId)) return NextResponse.json({ message: "需要管理员权限" }, { status: 403 }); const id = (await context.params).id;
  if (id === operatorId && body.data.active === false) return NextResponse.json({ message: "不能停用当前管理员账号" }, { status: 400 });
  let member = body.data.password ? await members.resetPassword(id, body.data.password) : members.get(id); if (member && body.data.active !== undefined) member = members.setActive(id, body.data.active);
  if (member) sqlite.prepare(`INSERT INTO audit_logs (id, operator_id, action, target_type, target_id, detail_json, created_at) VALUES (?, ?, 'member.updated', 'operator', ?, ?, ?)`).run(randomUUID(), operatorId, member.id, JSON.stringify({ active: body.data.active, passwordReset: Boolean(body.data.password) }), Date.now());
  return member ? NextResponse.json(member) : NextResponse.json({ message: "成员不存在" }, { status: 404 }); } finally { sqlite.close(); }
}
