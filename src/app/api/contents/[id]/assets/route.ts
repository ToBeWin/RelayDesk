import { NextResponse } from "next/server";
import { config } from "@/infrastructure/config/env";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createAssetService } from "@/modules/assets/service";
import { createContentService } from "@/modules/contents/service";

export const runtime = "nodejs";
export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const { id } = await context.params; const { sqlite } = createDatabase();
  try { if (!createContentService(sqlite).getOwned(id, operatorId)) return NextResponse.json({ message: "内容不存在" }, { status: 404 });
  return NextResponse.json(createAssetService(sqlite, config.dataDir).listForContent(id, operatorId)); } finally { sqlite.close(); }
}
