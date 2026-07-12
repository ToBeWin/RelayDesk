import { NextResponse } from "next/server";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createConversationService } from "@/modules/conversations/service";
import { getRuntimeConnectorForConnection } from "@/runtime/registry";
import { createAgentService } from "@/modules/agents/service";

export const runtime = "nodejs";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const { id } = await context.params; const { sqlite } = createDatabase();
  try { const service = createConversationService(sqlite, (runtimeId) => getRuntimeConnectorForConnection(sqlite, runtimeId)); const conversation = service.get(id, operatorId); if (!conversation) return NextResponse.json({ message: "会话不存在" }, { status: 404 }); if (!createAgentService(sqlite).canAccess(operatorId, conversation.runtimeConnectionId, "view_history")) return NextResponse.json({ message: "历史查看权限已被撤销" }, { status: 403 }); return NextResponse.json(await service.syncFromRuntime(id, operatorId)); }
  catch (error) {
    const runtimeError = error && typeof error === "object" && "code" in error && "message" in error
      ? error as { code: string; message: string }
      : undefined;
    const message = runtimeError?.code === "RUNTIME_AUTH_FAILED"
      ? "Hermes 授权已失效，请联系管理员检查 Agent Key"
      : runtimeError?.code === "SESSION_NOT_FOUND"
        ? "Hermes 中未找到这个会话；RelayDesk 本地历史已保留"
        : runtimeError?.code === "RUNTIME_UNAVAILABLE" || runtimeError?.code === "RUN_TIMEOUT"
          ? "Hermes 暂时不可用；RelayDesk 本地历史已保留，可稍后重试同步"
          : runtimeError?.message || (error instanceof Error ? error.message : "Runtime 同步失败");
    const status = runtimeError?.code === "RUNTIME_AUTH_FAILED" ? 401 : runtimeError?.code === "SESSION_NOT_FOUND" ? 404 : 502;
    return NextResponse.json({ message, code: runtimeError?.code ?? "UNKNOWN_RUNTIME_ERROR" }, { status });
  }
  finally { sqlite.close(); }
}
