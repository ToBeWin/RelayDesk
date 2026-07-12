import { NextResponse } from "next/server";
import { z } from "zod";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createScheduleService } from "@/modules/schedules/service";
import { canAccessContent } from "@/modules/agents/access";
export const runtime = "nodejs";
const schema = z.object({ contentRecordId: z.string().uuid(), scheduledAt: z.number().int().positive(), notes: z.string().max(1000).optional() });
export async function GET() { const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 }); const { sqlite } = createDatabase(); try { return NextResponse.json(createScheduleService(sqlite).list(operatorId).filter((entry) => canAccessContent(sqlite, operatorId, entry.contentRecordId))); } finally { sqlite.close(); } }
export async function POST(request: Request) { const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 }); const body = schema.safeParse(await request.json().catch(() => null)); if (!body.success) return NextResponse.json({ message: "排期信息不正确" }, { status: 400 }); const { sqlite } = createDatabase(); try { if (!canAccessContent(sqlite, operatorId, body.data.contentRecordId)) return NextResponse.json({ message: "内容管理权限已被撤销" }, { status: 403 }); return NextResponse.json(createScheduleService(sqlite).create({ ...body.data, operatorId }), { status: 201 }); } finally { sqlite.close(); } }
