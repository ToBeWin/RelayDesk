import { NextResponse } from "next/server";
import { z } from "zod";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createConversationService } from "@/modules/conversations/service";
import { getRuntimeConnectorForConnection } from "@/runtime/registry";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
const schema = z.object({ title: z.string().trim().min(1).max(120).optional(), status: z.enum(["active", "archived"]).optional(), pinned: z.boolean().optional() }).refine((value) => value.title || value.status || value.pinned !== undefined, "至少提供一个更新字段");
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const body = schema.safeParse(await request.json().catch(() => null)); if (!body.success) return NextResponse.json({ message: "会话更新参数不正确" }, { status: 400 });
  const { sqlite } = createDatabase(); try { const service = createConversationService(sqlite, (runtimeId) => getRuntimeConnectorForConnection(sqlite, runtimeId)); const id = (await context.params).id; if (!service.get(id, operatorId)) return NextResponse.json({ message: "会话不存在" }, { status: 404 });
  const conversation = body.data.status ? service.setStatus(id, body.data.status, operatorId) : body.data.pinned !== undefined ? service.setPinned(id, body.data.pinned, operatorId) : service.rename(id, body.data.title!, operatorId);
  return conversation ? NextResponse.json(conversation) : NextResponse.json({ message: "会话不存在" }, { status: 404 }); } finally { sqlite.close(); }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const { sqlite } = createDatabase();
  try {
    const id = (await context.params).id; const service = createConversationService(sqlite, (runtimeId) => getRuntimeConnectorForConnection(sqlite, runtimeId));
    if (!service.delete(id, operatorId)) return NextResponse.json({ message: "会话不存在" }, { status: 404 });
    sqlite.prepare(`INSERT INTO audit_logs (id, operator_id, action, target_type, target_id, detail_json, created_at) VALUES (?, ?, 'conversation.deleted', 'conversation', ?, '{"mode":"local_soft_delete"}', ?)`).run(randomUUID(), operatorId, id, Date.now());
    return new Response(null, { status: 204 });
  } finally { sqlite.close(); }
}
