import { NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/infrastructure/config/env";
import { createSessionToken } from "@/modules/auth/session";
import { isSameOrigin } from "@/shared/http/origin";
import { createDatabase } from "@/infrastructure/db/client";
import { createAgentService } from "@/modules/agents/service";
import { createMemberService } from "@/modules/members/service";
import { canAttemptLogin, clearLoginFailures, recordLoginFailure } from "@/modules/auth/login-attempts";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

const requestSchema = z.object({ password: z.string().min(1), operatorName: z.string().trim().min(1).max(40) });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Invalid request origin" }, { status: 403 });
  const result = requestSchema.safeParse(await request.json().catch(() => null));
  if (!result.success) return NextResponse.json({ message: "请输入工作区密码和操作者姓名" }, { status: 400 });
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  const attemptKey = `${address}:${result.data.operatorName.toLocaleLowerCase()}`;
  if (!canAttemptLogin(attemptKey)) return NextResponse.json({ message: "登录失败次数过多，请 15 分钟后再试" }, { status: 429 });

  const { sqlite } = createDatabase();
  let member;
  try {
    const configuredMembers = (sqlite.prepare(`SELECT COUNT(*) as count FROM operators WHERE password_hash IS NOT NULL`).get() as { count: number }).count;
    member = await createMemberService(sqlite).authenticateOrBootstrap({ name: result.data.operatorName, password: result.data.password, workspacePassword: config.password });
    if (!member) {
      recordLoginFailure(attemptKey);
      return NextResponse.json({ message: "成员名称或密码不正确，请联系管理员" }, { status: 401 });
    }
    // Only the first administrator receives the bootstrap Agent. Every later
    // member must be explicitly assigned Agents by an administrator.
    if (configuredMembers === 0 && member.role === "admin") createAgentService(sqlite).grantDefaultAccess(member.id);
    sqlite.prepare(`INSERT INTO audit_logs (id, operator_id, action, target_type, target_id, detail_json, created_at) VALUES (?, ?, 'auth.login.succeeded', 'operator', ?, ?, ?)`)
      .run(randomUUID(), member.id, member.id, JSON.stringify({ address }), Date.now());
  } finally { sqlite.close(); }

  clearLoginFailures(attemptKey);

  const response = NextResponse.json({ operatorName: member.name, role: member.role });
  response.cookies.set("relaydesk_session", createSessionToken(result.data.operatorName, config.sessionSecret), { httpOnly: true, sameSite: "lax", secure: config.cookieSecure, path: "/", maxAge: 60 * 60 * 24 * 14 });
  return response;
}
