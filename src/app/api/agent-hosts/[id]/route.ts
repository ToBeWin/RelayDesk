import { NextResponse } from "next/server";
import { z } from "zod";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createMemberService } from "@/modules/members/service";
import { createAgentHostService } from "@/modules/agents/host-service";

export const runtime = "nodejs";
const schema = z.object({ enabled: z.boolean() });
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 }); const body = schema.safeParse(await request.json().catch(() => null)); if (!body.success) return NextResponse.json({ message: "主机状态不正确" }, { status: 400 });
  const { sqlite } = createDatabase(); try { if (!createMemberService(sqlite).isAdmin(operatorId)) return NextResponse.json({ message: "需要管理员权限" }, { status: 403 }); const host = createAgentHostService(sqlite).setEnabled((await context.params).id, body.data.enabled, operatorId); return host ? NextResponse.json(host) : NextResponse.json({ message: "主机不存在" }, { status: 404 }); } finally { sqlite.close(); }
}
