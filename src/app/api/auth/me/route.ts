import { NextResponse } from "next/server";
import { getCurrentOperatorRecord } from "@/modules/auth/current-operator";

export const runtime = "nodejs";

export async function GET() {
  const operator = await getCurrentOperatorRecord();
  return operator ? NextResponse.json(operator) : NextResponse.json({ message: "未登录" }, { status: 401 });
}
