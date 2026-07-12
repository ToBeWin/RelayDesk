import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createContentService } from "@/modules/contents/service";
import { buildSelfCheckPrompt } from "@/modules/contents/self-check";
import { createConversationService } from "@/modules/conversations/service";
import { getRuntimeConnectorForConnection } from "@/runtime/registry";
import { canAccessContent } from "@/modules/agents/access";
export const runtime = "nodejs";
export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const { id } = await context.params; const { sqlite } = createDatabase(); try { const service = createContentService(sqlite); const content = service.get(id);
  if (!content) return NextResponse.json({ message: "内容不存在" }, { status: 404 }); if (!canAccessContent(sqlite, operatorId, id)) return NextResponse.json({ message: "内容管理权限已被撤销" }, { status: 403 });
  if (!createConversationService(sqlite, (runtimeId) => getRuntimeConnectorForConnection(sqlite, runtimeId)).get(content.conversationId, operatorId)) return NextResponse.json({ message: "无权查看该私聊的自检记录" }, { status: 403 });
  return NextResponse.json(service.listReviews(id)); } finally { sqlite.close(); }
}
export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const { id } = await context.params; const { sqlite } = createDatabase(); try { const contentService = createContentService(sqlite); const content = contentService.get(id); if (!content) return NextResponse.json({ message: "内容不存在" }, { status: 404 }); if (!canAccessContent(sqlite, operatorId, id)) return NextResponse.json({ message: "内容管理权限已被撤销" }, { status: 403 });
  const conversationService = createConversationService(sqlite, (runtimeId) => getRuntimeConnectorForConnection(sqlite, runtimeId)); if (!conversationService.get(content.conversationId, operatorId)) return NextResponse.json({ message: "只有来源私聊的成员可以发起自检" }, { status: 403 }); const account = content.contentAccountId ? sqlite.prepare(`SELECT code, name, description, notes FROM content_accounts WHERE id = ?`).get(content.contentAccountId) as { code: string; name: string; description: string | null; notes: string | null } | undefined : undefined; const accountContext = account ? `账号：${account.code} · ${account.name}\n定位：${account.description || "未填写"}\n备注：${account.notes || "无"}` : "当前内容未绑定内容账号"; const prompt = buildSelfCheckPrompt({ accountContext, contentMarkdown: content.bodyMarkdown });
  const reviewId = randomUUID(); const pendingRequestId = `pending:${randomUUID()}`;
  sqlite.prepare(`INSERT INTO content_reviews (id, content_record_id, request_message_id, status, created_at) VALUES (?, ?, ?, 'running', ?)`).run(reviewId, content.id, pendingRequestId, Date.now());
  let failedMessage: string | undefined;
  for await (const event of conversationService.send({ conversationId: content.conversationId, text: prompt, operatorId, taskKind: "self_check" })) { if (event.type === "run.failed") failedMessage = event.error.message; }
  const messages = conversationService.listMessages(content.conversationId); const request = [...messages].reverse().find((message) => message.role === "user"); const response = [...messages].reverse().find((message) => message.role === "assistant"); const score = response?.contentText.match(/(?:评分|得分|score)\D{0,8}(\d{1,3})/i)?.[1];
  const status = failedMessage ? "failed" : "completed";
  sqlite.prepare(`UPDATE content_reviews SET request_message_id = ?, response_message_id = ?, score = ?, result_markdown = ?, status = ? WHERE id = ?`).run(request?.id ?? pendingRequestId, response?.id ?? null, score ? Math.min(100, Number(score)) : null, response?.contentText ?? failedMessage ?? null, status, reviewId);
  if (failedMessage) return NextResponse.json({ status, message: failedMessage, resultMarkdown: response?.contentText ?? "" }, { status: 502 });
  return NextResponse.json({ status, score: score ? Math.min(100, Number(score)) : null, resultMarkdown: response?.contentText ?? "" }); } finally { sqlite.close(); }
}
