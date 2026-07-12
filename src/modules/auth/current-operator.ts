import { cookies } from "next/headers";
import { config } from "@/infrastructure/config/env";
import { readSessionToken } from "@/modules/auth/session";
import { createDatabase } from "@/infrastructure/db/client";

export async function getCurrentOperator(): Promise<string | null> {
  return readSessionToken((await cookies()).get("relaydesk_session")?.value, config.sessionSecret)?.operatorName ?? null;
}

export async function getCurrentOperatorId(): Promise<string | null> {
  const name = await getCurrentOperator();
  if (!name) return null;
  const { sqlite } = createDatabase();
  try {
    return (sqlite.prepare(`SELECT id FROM operators WHERE name = ? AND active = 1`).get(name) as { id: string } | undefined)?.id ?? null;
  } finally { sqlite.close(); }
}

export async function getCurrentOperatorRecord(): Promise<{ id: string; name: string; role: "admin" | "member" } | null> {
  const name = await getCurrentOperator();
  if (!name) return null;
  const { sqlite } = createDatabase();
  try {
    return sqlite.prepare(`SELECT id, name, role FROM operators WHERE name = ? AND active = 1`).get(name) as { id: string; name: string; role: "admin" | "member" } | undefined ?? null;
  } finally { sqlite.close(); }
}
