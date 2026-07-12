import { NextResponse } from "next/server";
import { z } from "zod";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createContentService } from "@/modules/contents/service";
import { createMemberService } from "@/modules/members/service";

export const runtime = "nodejs";
const schema = z.object({ name: z.string().trim().min(1).max(80).optional(), description: z.string().max(500).nullable().optional(), notes: z.string().max(1_000).nullable().optional(), defaultRuntimeConnectionId: z.string().max(120).nullable().optional(), enabled: z.boolean().optional() }).refine((input) => Object.keys(input).length > 0, "至少提供一个更新字段");

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await getCurrentOperatorId()) return NextResponse.json({ message: "未登录" }, { status: 401 }); const body = schema.safeParse(await request.json().catch(() => null)); if (!body.success) return NextResponse.json({ message: "账号更新参数不正确" }, { status: 400 });
  const operatorId = await getCurrentOperatorId(); const { sqlite } = createDatabase(); try { if (!operatorId || !createMemberService(sqlite).isAdmin(operatorId)) return NextResponse.json({ message: "需要管理员权限" }, { status: 403 }); if (body.data.defaultRuntimeConnectionId && !sqlite.prepare(`SELECT 1 FROM runtime_connections WHERE id = ? AND enabled = 1`).get(body.data.defaultRuntimeConnectionId)) return NextResponse.json({ message: "默认 Agent 不存在或已停用" }, { status: 400 }); const account = createContentService(sqlite).updateAccount((await context.params).id, body.data); return account ? NextResponse.json(account) : NextResponse.json({ message: "内容账号不存在" }, { status: 404 }); } finally { sqlite.close(); }
}
