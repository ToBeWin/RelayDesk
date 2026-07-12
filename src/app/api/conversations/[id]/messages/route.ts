import { NextResponse } from "next/server";
import { z } from "zod";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createConversationService } from "@/modules/conversations/service";
import { getRuntimeConnectorForConnection } from "@/runtime/registry";
import { config } from "@/infrastructure/config/env";
import { createAgentService } from "@/modules/agents/service";

export const runtime = "nodejs";
const bodySchema = z.object({ text: z.string().trim().min(1).max(20000), attachmentAssetIds: z.array(z.string().uuid()).max(10).optional() });
function service(sqlite: ReturnType<typeof createDatabase>["sqlite"]) { return createConversationService(sqlite, (id) => getRuntimeConnectorForConnection(sqlite, id), { dataDir: config.dataDir, runtimeSharedPaths: config.runtimeSharedPaths }); }
export async function GET(_: Request, context: { params: Promise<{ id: string }> }) { const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 }); const { id } = await context.params; const { sqlite } = createDatabase(); try { const conversations = service(sqlite); const conversation = conversations.get(id, operatorId); if (!conversation || !createAgentService(sqlite).canAccess(operatorId, conversation.runtimeConnectionId, "view_history")) return NextResponse.json({ message: "无权查看此 Agent 的历史会话" }, { status: 403 }); conversations.recoverStaleRuns(id, operatorId); return NextResponse.json(conversations.listMessages(id, operatorId)); } finally { sqlite.close(); } }
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const body = bodySchema.safeParse(await request.json().catch(() => null)); if (!body.success) return NextResponse.json({ message: "消息不能为空或过长" }, { status: 400 });
  const { id } = await context.params; const accessDb = createDatabase(); try { const conversation = service(accessDb.sqlite).get(id, operatorId); if (!conversation) return NextResponse.json({ message: "会话不存在" }, { status: 404 }); const access = createAgentService(accessDb.sqlite); if (!access.canAccess(operatorId, conversation.runtimeConnectionId, "chat")) return NextResponse.json({ message: "该 Agent 的聊天权限已被撤销" }, { status: 403 }); if (body.data.attachmentAssetIds?.length && !access.canAccess(operatorId, conversation.runtimeConnectionId, "upload")) return NextResponse.json({ message: "你没有向该 Agent 发送文件的权限" }, { status: 403 }); } finally { accessDb.sqlite.close(); } const encoder = new TextEncoder();
  const stream = new ReadableStream({ async start(controller) { const { sqlite } = createDatabase(); try { for await (const event of service(sqlite).send({ conversationId: id, text: body.data.text, operatorId, attachmentAssetIds: body.data.attachmentAssetIds })) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); } finally { sqlite.close(); controller.close(); } } });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
