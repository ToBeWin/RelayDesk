import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { config } from "@/infrastructure/config/env";
import { createHermesConnector } from "@/runtime/hermes/connector";

type ProfileEnv = { port?: number; host?: string; apiKey?: string };
export type LocalHermesProfile = { profileName: string; baseUrl: string | null; status: "healthy" | "offline" | "incomplete"; modelName: string | null; registered: boolean; hasApiKey: boolean };

async function readProfileEnv(profileHome: string): Promise<ProfileEnv> {
  const raw = await fs.readFile(path.join(profileHome, ".env"), "utf8").catch(() => "");
  const values = Object.fromEntries(raw.split(/\r?\n/).flatMap((line) => { const match = line.match(/^([A-Z0-9_]+)=(.*)$/); return match ? [[match[1], match[2].trim().replace(/^['"]|['"]$/g, "")]] : []; }));
  const port = Number(values.API_SERVER_PORT);
  return { port: Number.isInteger(port) && port > 0 ? port : undefined, host: values.API_SERVER_HOST, apiKey: values.API_SERVER_KEY };
}

export async function discoverLocalHermesProfiles(sqlite: Database.Database): Promise<LocalHermesProfile[]> {
  const home = os.homedir(); const root = path.join(home, ".hermes");
  const names = ["default", ...(await fs.readdir(path.join(root, "profiles"), { withFileTypes: true }).catch(() => [])).filter((entry) => entry.isDirectory()).map((entry) => entry.name)].filter((name, index, all) => all.indexOf(name) === index);
  const existing = new Set((sqlite.prepare(`SELECT profile_name as profileName FROM runtime_connections WHERE type = 'hermes'`).all() as { profileName: string | null }[]).map((row) => row.profileName).filter((name): name is string => Boolean(name)));
  return Promise.all(names.map(async (profileName) => {
    const profileHome = profileName === "default" ? root : path.join(root, "profiles", profileName); const env = await readProfileEnv(profileHome); const host = env.host === "0.0.0.0" || !env.host ? "127.0.0.1" : env.host; const baseUrl = env.port ? `http://${host}:${env.port}` : null;
    if (!baseUrl || !env.apiKey) return { profileName, baseUrl, status: "incomplete" as const, modelName: null, registered: existing.has(profileName), hasApiKey: Boolean(env.apiKey) };
    const connector = createHermesConnector({ baseUrl, apiKey: env.apiKey, timeoutMs: Math.min(config.hermesTimeoutMs, 5_000) }); const health = await connector.healthCheck(); const profiles = health.status === "healthy" ? await connector.listProfiles().catch(() => []) : [];
    return { profileName, baseUrl, status: health.status === "healthy" ? "healthy" as const : "offline" as const, modelName: profiles[0]?.name ?? null, registered: existing.has(profileName), hasApiKey: true };
  }));
}

export async function readLocalProfileApiKey(profileName: string): Promise<string | undefined> {
  if (!/^[A-Za-z0-9_-]+$/.test(profileName)) return undefined;
  const root = path.join(os.homedir(), ".hermes"); const env = await readProfileEnv(profileName === "default" ? root : path.join(root, "profiles", profileName)); return env.apiKey;
}
