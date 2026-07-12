import { NextResponse } from "next/server";
import { z } from "zod";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createAgentService } from "@/modules/agents/service";
import { createMemberService } from "@/modules/members/service";
import { config } from "@/infrastructure/config/env";
import { createAgentHostService } from "@/modules/agents/host-service";
import { encryptCredential } from "@/infrastructure/security/credentials";
import { createHermesConnector } from "@/runtime/hermes/connector";

export const runtime = "nodejs";
const schema = z.object({ name: z.string().trim().min(1).max(80), hostId: z.string().min(1).max(120), baseUrl: z.string().url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol)), profileName: z.string().trim().regex(/^[A-Za-z0-9_-]+$/).max(80), sharingMode: z.enum(["shared", "dedicated"]), apiKey: z.string().min(8).max(500).optional(), apiKeyEnv: z.string().regex(/^RELAYDESK_[A-Z0-9_]+$/).max(120).optional() }).refine((value) => Boolean(value.apiKey) !== Boolean(value.apiKeyEnv), "必须且只能提供一种凭据");

export async function GET() {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 }); const { sqlite } = createDatabase(); try { if (!createMemberService(sqlite).isAdmin(operatorId)) return NextResponse.json({ message: "需要管理员权限" }, { status: 403 });
  return NextResponse.json(createAgentService(sqlite).listAll()); } finally { sqlite.close(); }
}

export async function POST(request: Request) {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 }); const body = schema.safeParse(await request.json().catch(() => null)); if (!body.success) return NextResponse.json({ message: "Agent 实例参数不正确" }, { status: 400 }); const { sqlite } = createDatabase(); try { if (!createMemberService(sqlite).isAdmin(operatorId)) return NextResponse.json({ message: "需要管理员权限" }, { status: 403 });
  const host = createAgentHostService(sqlite).get(body.data.hostId); if (!host?.enabled) return NextResponse.json({ message: "Agent Host 不存在或已停用" }, { status: 400 });
  if (new URL(body.data.baseUrl).hostname.toLocaleLowerCase() !== host.address) return NextResponse.json({ message: "API 地址必须属于所选 Agent Host" }, { status: 400 });
  const apiKey = body.data.apiKey ?? process.env[body.data.apiKeyEnv!]; if (!apiKey) return NextResponse.json({ message: `环境变量 ${body.data.apiKeyEnv} 尚未配置` }, { status: 400 });
  const connector = createHermesConnector({ baseUrl: body.data.baseUrl, apiKey, timeoutMs: Math.min(config.hermesTimeoutMs, 15_000) }); const health = await connector.healthCheck(); if (health.status !== "healthy") return NextResponse.json({ message: `无法连接 Hermes：${health.message}` }, { status: 400 });
  const info = await connector.getInfo().catch(() => null); if (!info) return NextResponse.json({ message: "目标服务不是兼容的 Hermes API Server" }, { status: 400 });
  return NextResponse.json(createAgentService(sqlite).create({ ...body.data, credentialCiphertext: body.data.apiKey ? encryptCredential(body.data.apiKey) : undefined }, operatorId), { status: 201 }); } finally { sqlite.close(); }
}
