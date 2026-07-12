import { NextResponse } from "next/server";
import { z } from "zod";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createAgentService, type AgentPermission } from "@/modules/agents/service";
import { createMemberService } from "@/modules/members/service";

export const runtime = "nodejs";
const permissionSchema = z.enum(["chat", "upload", "view_history"]);
const schema = z.object({ grants: z.array(z.object({ runtimeConnectionId: z.string().min(1).max(120), permissions: z.array(permissionSchema).min(1).max(3) })).max(50) });

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const currentId = await getCurrentOperatorId(); if (!currentId) return NextResponse.json({ message: "未登录" }, { status: 401 }); const { sqlite } = createDatabase(); try { const members = createMemberService(sqlite); if (!members.isAdmin(currentId)) return NextResponse.json({ message: "需要管理员权限" }, { status: 403 });
  return NextResponse.json(createAgentService(sqlite).listAuthorized((await context.params).id)); } finally { sqlite.close(); }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const currentId = await getCurrentOperatorId(); if (!currentId) return NextResponse.json({ message: "未登录" }, { status: 401 }); const body = schema.safeParse(await request.json().catch(() => null)); if (!body.success) return NextResponse.json({ message: "授权参数不正确" }, { status: 400 });
  const { sqlite } = createDatabase(); try { const members = createMemberService(sqlite); if (!members.isAdmin(currentId)) return NextResponse.json({ message: "需要管理员权限" }, { status: 403 }); const memberId = (await context.params).id; if (!members.get(memberId)) return NextResponse.json({ message: "成员不存在" }, { status: 404 });
  const agents = createAgentService(sqlite); const validIds = new Set(agents.listAll().filter((agent) => agent.enabled).map((agent) => agent.id)); if (body.data.grants.some((grant) => !validIds.has(grant.runtimeConnectionId))) return NextResponse.json({ message: "包含不存在或停用的 Agent" }, { status: 400 });
  try { return NextResponse.json(agents.setAccess(memberId, body.data.grants as { runtimeConnectionId: string; permissions: AgentPermission[] }[], currentId)); } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "授权保存失败" }, { status: 409 }); } } finally { sqlite.close(); }
}
