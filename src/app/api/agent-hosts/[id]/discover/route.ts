import { NextResponse } from "next/server";
import { z } from "zod";
import { createDatabase } from "@/infrastructure/db/client";
import { config } from "@/infrastructure/config/env";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createMemberService } from "@/modules/members/service";
import { createAgentHostService } from "@/modules/agents/host-service";
import { createHermesConnector } from "@/runtime/hermes/connector";

export const runtime = "nodejs";
const schema = z.object({ protocol: z.enum(["http", "https"]).default("http"), ports: z.array(z.number().int().min(1).max(65535)).min(1).max(20), apiKey: z.string().min(8).max(500) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 }); const body = schema.safeParse(await request.json().catch(() => null)); if (!body.success) return NextResponse.json({ message: "探测参数不正确，最多指定 20 个端口" }, { status: 400 });
  const { sqlite } = createDatabase(); try { if (!createMemberService(sqlite).isAdmin(operatorId)) return NextResponse.json({ message: "需要管理员权限" }, { status: 403 }); const host = createAgentHostService(sqlite).get((await context.params).id); if (!host?.enabled) return NextResponse.json({ message: "Agent Host 不存在或已停用" }, { status: 404 });
    const discovered = (await Promise.all([...new Set(body.data.ports)].map(async (port) => { const baseUrl = `${body.data.protocol}://${host.address}:${port}`; const connector = createHermesConnector({ baseUrl, apiKey: body.data.apiKey, timeoutMs: Math.min(5_000, config.hermesTimeoutMs) }); const health = await connector.healthCheck(); if (health.status !== "healthy") return null; const profiles = await connector.listProfiles().catch(() => []); const capabilities = await connector.getCapabilities().catch(() => undefined); return { baseUrl, port, profiles, capabilities }; }))).filter(Boolean);
    return NextResponse.json(discovered);
  } finally { sqlite.close(); }
}
