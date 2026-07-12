import { NextResponse } from "next/server";
import { z } from "zod";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createMemberService } from "@/modules/members/service";
import { createAgentService } from "@/modules/agents/service";
import { discoverLocalHermesProfiles, readLocalProfileApiKey } from "@/modules/agents/local-profile-discovery";
import { encryptCredential } from "@/infrastructure/security/credentials";

export const runtime = "nodejs";
const schema = z.object({ profileNames: z.array(z.string().regex(/^[A-Za-z0-9_-]+$/)).min(1).max(20) });

export async function GET() {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 }); const { sqlite } = createDatabase(); try { if (!createMemberService(sqlite).isAdmin(operatorId)) return NextResponse.json({ message: "需要管理员权限" }, { status: 403 }); createAgentService(sqlite).ensureDefaultInstance(); return NextResponse.json(await discoverLocalHermesProfiles(sqlite)); } finally { sqlite.close(); }
}

export async function POST(request: Request) {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 }); const body = schema.safeParse(await request.json().catch(() => null)); if (!body.success) return NextResponse.json({ message: "请选择待关联的本机 Profile" }, { status: 400 }); const { sqlite } = createDatabase(); try { if (!createMemberService(sqlite).isAdmin(operatorId)) return NextResponse.json({ message: "需要管理员权限" }, { status: 403 }); const agents = createAgentService(sqlite); agents.ensureDefaultInstance(); const discovered = await discoverLocalHermesProfiles(sqlite); const added = [];
    for (const profileName of body.data.profileNames) { const profile = discovered.find((item) => item.profileName === profileName); if (!profile || profile.status !== "healthy" || !profile.baseUrl || profile.registered) continue; const key = await readLocalProfileApiKey(profileName); if (!key) continue; added.push(agents.create({ name: profileName === "default" ? "默认 Hermes Agent" : `${profileName} Agent`, baseUrl: profile.baseUrl, profileName, hostId: "host-local-default", sharingMode: "shared", credentialCiphertext: encryptCredential(key) }, operatorId)); }
    return NextResponse.json({ added, discovered: await discoverLocalHermesProfiles(sqlite) }, { status: 201 });
  } finally { sqlite.close(); }
}
