import { NextResponse } from "next/server";
import { z } from "zod";
import { createDatabase } from "@/infrastructure/db/client";
import { config } from "@/infrastructure/config/env";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { buildCoverPrompt } from "@/modules/contents/cover";
import { createContentService } from "@/modules/contents/service";
import { createConversationService } from "@/modules/conversations/service";
import { createAssetService } from "@/modules/assets/service";
import { getRuntimeConnectorForConnection } from "@/runtime/registry";
import { canAccessContent } from "@/modules/agents/access";

export const runtime = "nodejs";
const schema = z.object({ aspectRatio: z.string().min(2).max(30).default("3:4"), requirements: z.string().max(2_000).optional(), mode: z.enum(["generate", "regenerate"]).default("generate") });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const body = schema.safeParse(await request.json().catch(() => ({}))); if (!body.success) return NextResponse.json({ message: "封面参数不正确" }, { status: 400 });
  const { id } = await context.params; const { sqlite } = createDatabase(); try { const content = createContentService(sqlite).get(id); if (!content) return NextResponse.json({ message: "内容不存在" }, { status: 404 }); if (!canAccessContent(sqlite, operatorId, id)) return NextResponse.json({ message: "内容管理权限已被撤销" }, { status: 403 });
  const prompt = buildCoverPrompt({ title: content.title, aspectRatio: body.data.aspectRatio, requirements: body.data.requirements, mode: body.data.mode }); const conversations = createConversationService(sqlite, (runtimeId) => getRuntimeConnectorForConnection(sqlite, runtimeId), { dataDir: config.dataDir, runtimeSharedPaths: config.runtimeSharedPaths }); if (!conversations.get(content.conversationId, operatorId)) return NextResponse.json({ message: "只有来源私聊的成员可以生成封面" }, { status: 403 });
  const referenceAssetIds = body.data.mode === "generate" ? createAssetService(sqlite, config.dataDir).listForContent(content.id, operatorId).slice(0, 10).map((asset) => asset.id) : [];
  let finalText = ""; let failed: string | undefined; for await (const event of conversations.send({ conversationId: content.conversationId, text: prompt, operatorId, taskKind: body.data.mode === "regenerate" ? "cover_regenerate" : "cover_generate", attachmentAssetIds: referenceAssetIds })) { if (event.type === "message.completed") finalText = event.message.text; if (event.type === "run.failed") failed = event.error.message; }
  if (failed) return NextResponse.json({ status: "failed", message: failed, resultMarkdown: finalText }, { status: 502 });
  sqlite.prepare(`UPDATE assets SET content_record_id = ? WHERE asset_type = 'image' AND message_id = (SELECT id FROM messages WHERE conversation_id = ? AND role = 'assistant' AND task_kind IN ('cover_generate', 'cover_regenerate') ORDER BY sequence_no DESC LIMIT 1)`).run(content.id, content.conversationId);
  return NextResponse.json({ status: "completed", resultMarkdown: finalText }); } finally { sqlite.close(); }
}
