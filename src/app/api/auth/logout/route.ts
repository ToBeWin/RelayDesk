import { NextResponse } from "next/server";
import { config } from "@/infrastructure/config/env";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";

export const runtime = "nodejs";

export async function POST() {
  if (!await getCurrentOperatorId()) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set("relaydesk_session", "", { httpOnly: true, sameSite: "lax", secure: config.cookieSecure, path: "/", maxAge: 0 });
  return response;
}
