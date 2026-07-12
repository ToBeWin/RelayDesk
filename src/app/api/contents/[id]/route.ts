import { NextResponse } from "next/server";
import { z } from "zod";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createContentService } from "@/modules/contents/service";
import { canAccessContent } from "@/modules/agents/access";

export const runtime = "nodejs";
const schema = z.object({ title: z.string().trim().min(1).max(120).optional(), status: z.enum(["draft", "checking", "needs_revision", "ready", "scheduled", "published", "archived"]).optional(), notes: z.string().max(4_000).optional(), bodyMarkdown: z.string().min(1).max(100_000).optional() }).refine((input) => Object.keys(input).length > 0, "至少提供一个更新字段");

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const body = schema.safeParse(await request.json().catch(() => null)); if (!body.success) return NextResponse.json({ message: "内容更新参数不正确" }, { status: 400 });
  const { sqlite } = createDatabase(); try { const id = (await context.params).id; if (!canAccessContent(sqlite, operatorId, id)) return NextResponse.json({ message: "内容管理权限已被撤销" }, { status: 403 }); const content = createContentService(sqlite).updateOwned(id, operatorId, body.data);
  return content ? NextResponse.json(content) : NextResponse.json({ message: "内容不存在" }, { status: 404 }); } finally { sqlite.close(); }
}
