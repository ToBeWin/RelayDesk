import { NextResponse } from "next/server";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createConversationService } from "@/modules/conversations/service";
import { getRuntimeConnectorForConnection } from "@/runtime/registry";

export const runtime = "nodejs";
export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const { sqlite } = createDatabase(); try { const service = createConversationService(sqlite, (runtimeId) => getRuntimeConnectorForConnection(sqlite, runtimeId)); const id = (await context.params).id; if (!service.get(id, operatorId)) return NextResponse.json({ message: "会话不存在" }, { status: 404 }); const stopped = await service.cancelLatest(id, operatorId);
  return stopped ? NextResponse.json({ status: "cancelled" }) : NextResponse.json({ message: "当前运行不支持停止或已经结束" }, { status: 409 }); } finally { sqlite.close(); }
}
