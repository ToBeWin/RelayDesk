import { NextResponse } from "next/server";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createAgentService } from "@/modules/agents/service";
import { getRuntimeConnectorForConnection } from "@/runtime/registry";
import { createMemberService } from "@/modules/members/service";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const operatorId = await getCurrentOperatorId();
  if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const { id } = await params;
  const { sqlite } = createDatabase();
  try {
    if (!createAgentService(sqlite).canUse(operatorId, id) && !createMemberService(sqlite).isAdmin(operatorId)) return NextResponse.json({ message: "无权使用此 Agent" }, { status: 403 });
    const connector = getRuntimeConnectorForConnection(sqlite, id);
    const health = await connector.healthCheck();
    const capabilities = health.status === "healthy" ? await connector.getCapabilities().catch(() => undefined) : undefined;
    return NextResponse.json({ ...health, capabilities });
  } finally { sqlite.close(); }
}
