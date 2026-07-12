import { NextResponse } from "next/server";
import { z } from "zod";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createContentService } from "@/modules/contents/service";
import { canAccessConversation } from "@/modules/agents/access";
export const runtime = "nodejs";
const schema = z.object({ messageId: z.string().uuid(), contentAccountId: z.string().uuid().optional() });
export async function GET() { const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 }); const { sqlite } = createDatabase(); try { return NextResponse.json(createContentService(sqlite).listOwned(operatorId).filter((content) => canAccessConversation(sqlite, operatorId, content.conversationId, "manage_content"))); } finally { sqlite.close(); } }
export async function POST(request: Request) { const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 }); const body = schema.safeParse(await request.json().catch(() => null)); if (!body.success) return NextResponse.json({ message: "内容来源不正确" }, { status: 400 }); const { sqlite } = createDatabase(); try { const source = sqlite.prepare(`SELECT conversation_id as conversationId FROM messages WHERE id = ?`).get(body.data.messageId) as { conversationId: string } | undefined; if (!source || !canAccessConversation(sqlite, operatorId, source.conversationId, "manage_content")) return NextResponse.json({ message: "你没有管理该 Agent 内容的权限" }, { status: 403 }); return NextResponse.json(createContentService(sqlite).saveFromMessage({ ...body.data, operatorId }), { status: 201 }); } catch { return NextResponse.json({ message: "该消息无法保存为内容" }, { status: 400 }); } finally { sqlite.close(); } }
