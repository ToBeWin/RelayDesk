import { NextResponse } from "next/server";
import { z } from "zod";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createAgentService } from "@/modules/agents/service";
import { createMemberService } from "@/modules/members/service";
import { encryptCredential } from "@/infrastructure/security/credentials";
import { createHermesConnector } from "@/runtime/hermes/connector";
import { config } from "@/infrastructure/config/env";

export const runtime = "nodejs";
const schema = z.object({ enabled: z.boolean().optional(), name: z.string().trim().min(1).max(80).optional(), sharingMode: z.enum(["shared", "dedicated"]).optional(), apiKey: z.string().min(8).max(500).optional() }).refine((value) => Object.keys(value).length > 0, "至少提供一个更新字段");
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 }); const body = schema.safeParse(await request.json().catch(() => null)); if (!body.success) return NextResponse.json({ message: "Agent 状态不正确" }, { status: 400 });
  const { sqlite } = createDatabase(); try { if (!createMemberService(sqlite).isAdmin(operatorId)) return NextResponse.json({ message: "需要管理员权限" }, { status: 403 }); const id = (await context.params).id; const service = createAgentService(sqlite); const current = service.listAll().find((agent) => agent.id === id); if (!current) return NextResponse.json({ message: "Agent 不存在" }, { status: 404 });
  if (body.data.apiKey) { const connector = createHermesConnector({ baseUrl: current.baseUrl, apiKey: body.data.apiKey, timeoutMs: Math.min(config.hermesTimeoutMs, 15_000) }); const health = await connector.healthCheck(); if (health.status !== "healthy" || !await connector.getInfo().catch(() => null)) return NextResponse.json({ message: "新 Key 无法通过 Hermes 验证，原凭据保持不变" }, { status: 400 }); }
  try { const agent = body.data.enabled === undefined ? service.update(id, { name: body.data.name, sharingMode: body.data.sharingMode, credentialCiphertext: body.data.apiKey ? encryptCredential(body.data.apiKey) : undefined }, operatorId) : service.setEnabled(id, body.data.enabled, operatorId); return agent ? NextResponse.json(agent) : NextResponse.json({ message: "默认 Agent 不可停用" }, { status: 400 }); } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Agent 更新失败" }, { status: 409 }); } } finally { sqlite.close(); }
}
