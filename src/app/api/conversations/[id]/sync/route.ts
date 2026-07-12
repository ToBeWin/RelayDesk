import { NextResponse } from "next/server";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createConversationService } from "@/modules/conversations/service";
import { getRuntimeConnectorForConnection } from "@/runtime/registry";
import { createAgentService } from "@/modules/agents/service";

export const runtime = "nodejs";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await context.params; const { sqlite } = createDatabase();
  try { const service = createConversationService(sqlite, (runtimeId) => getRuntimeConnectorForConnection(sqlite, runtimeId)); const conversation = service.get(id, operatorId); if (!conversation) return NextResponse.json({ code: "CONVERSATION_NOT_FOUND" }, { status: 404 }); if (!createAgentService(sqlite).canAccess(operatorId, conversation.runtimeConnectionId, "view_history")) return NextResponse.json({ code: "AGENT_ACCESS_REVOKED" }, { status: 403 }); return NextResponse.json(await service.syncFromRuntime(id, operatorId)); }
  catch (error) {
    const runtimeError = error && typeof error === "object" && "code" in error && "message" in error
      ? error as { code: string; message: string }
      : undefined;
    const status = runtimeError?.code === "RUNTIME_AUTH_FAILED" ? 401 : runtimeError?.code === "SESSION_NOT_FOUND" ? 404 : 502;
    return NextResponse.json({ code: runtimeError?.code ?? "UNKNOWN_RUNTIME_ERROR" }, { status });
  }
  finally { sqlite.close(); }
}
