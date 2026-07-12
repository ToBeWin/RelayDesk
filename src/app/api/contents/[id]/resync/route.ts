import { NextResponse } from "next/server";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createContentService } from "@/modules/contents/service";
import { createConversationService } from "@/modules/conversations/service";
import { getRuntimeConnectorForConnection } from "@/runtime/registry";
import { canAccessContent } from "@/modules/agents/access";

export const runtime = "nodejs";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const { id } = await context.params; const { sqlite } = createDatabase();
  try {
    const content = createContentService(sqlite).get(id); if (!content) return NextResponse.json({ message: "内容不存在" }, { status: 404 }); if (!canAccessContent(sqlite, operatorId, id)) return NextResponse.json({ message: "内容管理权限已被撤销" }, { status: 403 });
    const conversations = createConversationService(sqlite, (runtimeId) => getRuntimeConnectorForConnection(sqlite, runtimeId)); if (!conversations.get(content.conversationId, operatorId)) return NextResponse.json({ message: "只有来源私聊的成员可以同步上下文" }, { status: 403 });
    const account = content.contentAccountId ? sqlite.prepare(`SELECT code, name, description, notes FROM content_accounts WHERE id = ?`).get(content.contentAccountId) as { code: string; name: string; description: string | null; notes: string | null } | undefined : undefined;
    const schedule = sqlite.prepare(`SELECT scheduled_at as scheduledAt, status, notes FROM schedule_entries WHERE content_record_id = ? ORDER BY scheduled_at DESC LIMIT 1`).get(content.id) as { scheduledAt: number; status: string; notes: string | null } | undefined;
    const cover = content.selectedCoverAssetId ? sqlite.prepare(`SELECT original_name as originalName FROM assets WHERE id = ?`).get(content.selectedCoverAssetId) as { originalName: string | null } | undefined : undefined;
    const prompt = `请重新读取并确认以下工作上下文，后续修改以此为准。\n\n【账号信息】\n${account ? `${account.code} · ${account.name}\n定位：${account.description || "未填写"}\n备注：${account.notes || "无"}` : "未绑定内容账号"}\n\n【当前内容】\n${content.bodyMarkdown}\n\n【最终封面】\n${cover?.originalName || "尚未选择"}\n\n【排期】\n${schedule ? `${new Date(schedule.scheduledAt).toISOString()} · ${schedule.status} · ${schedule.notes || "无备注"}` : "尚未排期"}\n\n请简短确认已同步，不要改写正文。`;
    let result = ""; let failed: string | undefined; for await (const event of conversations.send({ conversationId: content.conversationId, text: prompt, operatorId, taskKind: "context_resync" })) { if (event.type === "message.completed") result = event.message.text; if (event.type === "run.failed") failed = event.error.message; }
    if (failed) return NextResponse.json({ message: failed, resultMarkdown: result }, { status: 502 });
    return NextResponse.json({ status: "completed", resultMarkdown: result });
  } finally { sqlite.close(); }
}
