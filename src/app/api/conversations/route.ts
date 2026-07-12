import { NextResponse } from "next/server";
import { z } from "zod";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createConversationService } from "@/modules/conversations/service";
import { getRuntimeConnectorForConnection } from "@/runtime/registry";
import { createAgentService } from "@/modules/agents/service";
import { logError } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";
const schema = z.object({ title: z.string().trim().min(1).max(120).optional(), runtimeConnectionId: z.string().min(1).max(120).default("hermes-default") });
export async function GET() { const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 }); const { sqlite } = createDatabase(); try { const access = createAgentService(sqlite); return NextResponse.json(createConversationService(sqlite, (id) => getRuntimeConnectorForConnection(sqlite, id)).list(operatorId).filter((conversation) => access.canAccess(operatorId, conversation.runtimeConnectionId, "view_history"))); } finally { sqlite.close(); } }
export async function POST(request: Request) {
  const operatorId = await getCurrentOperatorId();
  if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const body = schema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ message: "会话标题不正确" }, { status: 400 });
  const { sqlite } = createDatabase();
  try {
    if (!createAgentService(sqlite).canUse(operatorId, body.data.runtimeConnectionId)) return NextResponse.json({ message: "你没有该 Agent 的私聊权限" }, { status: 403 });
    const conversation = await createConversationService(sqlite, (id) => getRuntimeConnectorForConnection(sqlite, id)).create({ ...body.data, operatorId });
    return NextResponse.json(conversation, { status: 201 });
  } catch (error) {
    const runtimeError = error && typeof error === "object" && "code" in error ? error as { code?: string } : undefined;
    const baseMessage = runtimeError?.code === "RUNTIME_UNAVAILABLE" ? "Hermes 正在同步，请稍后重试新建会话" : "新建会话失败，请检查 Agent 连接后重试";
    const detail = error instanceof Error ? error.message : typeof error === "string" ? error : (() => { try { return JSON.stringify(error); } catch { return "unknown error"; } })();
    const message = process.env.NODE_ENV === "development" ? `${baseMessage}：${detail}` : baseMessage;
    logError("conversation.create.failed", error, { requestId: request.headers.get("x-request-id"), operatorId, runtimeConnectionId: body.data.runtimeConnectionId });
    return NextResponse.json({ message }, { status: runtimeError?.code === "RUNTIME_UNAVAILABLE" ? 503 : 500 });
  } finally {
    sqlite.close();
  }
}
