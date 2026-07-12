import { NextResponse } from "next/server";
import { z } from "zod";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createScheduleService } from "@/modules/schedules/service";
import { canAccessContent } from "@/modules/agents/access";

export const runtime = "nodejs";
const schema = z.object({ status: z.enum(["planned", "completed", "cancelled"]) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ message: "排期状态不正确" }, { status: 400 });
  const { id } = await context.params; const { sqlite } = createDatabase(); try { const existing = createScheduleService(sqlite).list(operatorId).find((entry) => entry.id === id); if (!existing || !canAccessContent(sqlite, operatorId, existing.contentRecordId)) return NextResponse.json({ message: "内容管理权限已被撤销" }, { status: 403 }); const entry = createScheduleService(sqlite).updateStatus(id, body.data.status, operatorId);
  return entry ? NextResponse.json(entry) : NextResponse.json({ message: "排期不存在" }, { status: 404 }); } finally { sqlite.close(); }
}
