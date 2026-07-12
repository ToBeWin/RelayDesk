import { NextResponse } from "next/server";
import { z } from "zod";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createMemberService } from "@/modules/members/service";
import { createAgentHostService } from "@/modules/agents/host-service";
import { createAgentService } from "@/modules/agents/service";

export const runtime = "nodejs";
const schema = z.object({ name: z.string().trim().min(1).max(80), address: z.string().trim().min(1).max(255), description: z.string().trim().max(500).optional() });

export async function GET() {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const { sqlite } = createDatabase(); try { if (!createMemberService(sqlite).isAdmin(operatorId)) return NextResponse.json({ message: "需要管理员权限" }, { status: 403 }); createAgentService(sqlite).ensureDefaultInstance(); return NextResponse.json(createAgentHostService(sqlite).list()); } finally { sqlite.close(); }
}

export async function POST(request: Request) {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const body = schema.safeParse(await request.json().catch(() => null)); if (!body.success) return NextResponse.json({ message: "主机信息不正确" }, { status: 400 });
  const { sqlite } = createDatabase(); try { if (!createMemberService(sqlite).isAdmin(operatorId)) return NextResponse.json({ message: "需要管理员权限" }, { status: 403 }); try { return NextResponse.json(createAgentHostService(sqlite).create(body.data, operatorId), { status: 201 }); } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "主机登记失败" }, { status: 400 }); } } finally { sqlite.close(); }
}
