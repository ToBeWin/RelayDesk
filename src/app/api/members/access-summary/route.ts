import { NextResponse } from "next/server";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createMemberService } from "@/modules/members/service";

export const runtime = "nodejs";

export async function GET() {
  const operatorId = await getCurrentOperatorId();
  if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const { sqlite } = createDatabase();
  try {
    const members = createMemberService(sqlite);
    if (!members.isAdmin(operatorId)) return NextResponse.json({ message: "需要管理员权限" }, { status: 403 });
    return NextResponse.json(members.getAccessSummary());
  } finally {
    sqlite.close();
  }
}
