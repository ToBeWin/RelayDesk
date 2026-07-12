import { NextResponse } from "next/server";
import { z } from "zod";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createContentService } from "@/modules/contents/service";
import { createConversationService } from "@/modules/conversations/service";
import { canAccessContent } from "@/modules/agents/access";
import { getRuntimeConnectorForConnection } from "@/runtime/registry";
export const runtime = "nodejs";
const schema = z.object({ assetId: z.string().uuid() });
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) { const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 }); const body = schema.safeParse(await request.json().catch(() => null)); if (!body.success) return NextResponse.json({ message: "封面资产不正确" }, { status: 400 }); const { sqlite } = createDatabase(); try { const service = createContentService(sqlite); const id = (await context.params).id; const current = service.get(id); if (!current) return NextResponse.json({ message: "内容不存在" }, { status: 404 }); if (!canAccessContent(sqlite, operatorId, id) || !createConversationService(sqlite, (runtimeId) => getRuntimeConnectorForConnection(sqlite, runtimeId)).get(current.conversationId, operatorId)) return NextResponse.json({ message: "无权修改该私聊内容" }, { status: 403 }); return NextResponse.json(service.selectCover(id, body.data.assetId)); } catch { return NextResponse.json({ message: "封面必须是该内容已归档的图片" }, { status: 400 }); } finally { sqlite.close(); } }
