import { NextResponse } from "next/server";
import { z } from "zod";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperator, getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createMemberService } from "@/modules/members/service";
import { createContentService } from "@/modules/contents/service";
export const runtime = "nodejs";
const schema = z.object({ code: z.string().trim().min(1).max(32), name: z.string().trim().min(1).max(80), description: z.string().max(500).optional(), notes: z.string().max(1000).optional(), defaultRuntimeConnectionId: z.string().min(1).max(120).optional() });
export async function GET() { if (!await getCurrentOperator()) return NextResponse.json({ message: "未登录" }, { status: 401 }); const { sqlite } = createDatabase(); try { return NextResponse.json(createContentService(sqlite).listAccounts()); } finally { sqlite.close(); } }
export async function POST(request: Request) { const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 }); const body = schema.safeParse(await request.json().catch(() => null)); if (!body.success) return NextResponse.json({ message: "账号信息不正确" }, { status: 400 }); const { sqlite } = createDatabase(); try { if (!createMemberService(sqlite).isAdmin(operatorId)) return NextResponse.json({ message: "需要管理员权限" }, { status: 403 }); if (body.data.defaultRuntimeConnectionId && !sqlite.prepare(`SELECT 1 FROM runtime_connections WHERE id = ? AND enabled = 1`).get(body.data.defaultRuntimeConnectionId)) return NextResponse.json({ message: "默认 Agent 不存在" }, { status: 400 }); return NextResponse.json(createContentService(sqlite).createAccount(body.data), { status: 201 }); } catch { return NextResponse.json({ message: "账号编号已存在" }, { status: 409 }); } finally { sqlite.close(); } }
