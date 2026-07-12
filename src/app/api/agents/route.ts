import { NextResponse } from "next/server";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createAgentService } from "@/modules/agents/service";

export const runtime = "nodejs";

export async function GET() {
  const operatorId = await getCurrentOperatorId();
  if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const { sqlite } = createDatabase();
  try { return NextResponse.json(createAgentService(sqlite).listAuthorized(operatorId)); } finally { sqlite.close(); }
}
