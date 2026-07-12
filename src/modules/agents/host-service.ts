import { isIP } from "node:net";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { config } from "@/infrastructure/config/env";

export type AgentHost = { id: string; name: string; address: string; description: string | null; enabled: boolean; agentCount: number; createdAt: number; updatedAt: number };

function isPrivateAddress(address: string): boolean {
  const host = address.trim().toLocaleLowerCase();
  if (["localhost", "127.0.0.1", "::1", "host.docker.internal"].includes(host)) return true;
  if (isIP(host) === 4) {
    const [a, b] = host.split(".").map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return config.runtimeAllowedHosts.includes(host);
}

export function createAgentHostService(sqlite: Database.Database) {
  const select = `SELECT agent_hosts.id, agent_hosts.name, agent_hosts.address, agent_hosts.description, agent_hosts.enabled, COUNT(runtime_connections.id) as agentCount, agent_hosts.created_at as createdAt, agent_hosts.updated_at as updatedAt FROM agent_hosts LEFT JOIN runtime_connections ON runtime_connections.host_id = agent_hosts.id`;
  const map = (row: Record<string, unknown>): AgentHost => ({ id: String(row.id), name: String(row.name), address: String(row.address), description: row.description as string | null, enabled: Boolean(row.enabled), agentCount: Number(row.agentCount), createdAt: Number(row.createdAt), updatedAt: Number(row.updatedAt) });
  return {
    list(): AgentHost[] { return (sqlite.prepare(`${select} GROUP BY agent_hosts.id ORDER BY agent_hosts.name`).all() as Record<string, unknown>[]).map(map); },
    get(id: string): AgentHost | undefined { const row = sqlite.prepare(`${select} WHERE agent_hosts.id = ? GROUP BY agent_hosts.id`).get(id) as Record<string, unknown> | undefined; return row ? map(row) : undefined; },
    create(input: { name: string; address: string; description?: string }, operatorId: string): AgentHost {
      const address = input.address.trim().toLocaleLowerCase();
      if (!isPrivateAddress(address)) throw new Error("仅允许私有内网 IP、localhost 或显式白名单主机");
      const id = randomUUID(); const now = Date.now();
      sqlite.transaction(() => {
        sqlite.prepare(`INSERT INTO agent_hosts (id, name, address, description, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`).run(id, input.name.trim(), address, input.description?.trim() || null, now, now);
        sqlite.prepare(`INSERT INTO audit_logs (id, operator_id, action, target_type, target_id, detail_json, created_at) VALUES (?, ?, 'agent_host.created', 'agent_host', ?, ?, ?)`).run(randomUUID(), operatorId, id, JSON.stringify({ name: input.name, address }), now);
      })();
      return this.get(id)!;
    },
    setEnabled(id: string, enabled: boolean, operatorId: string): AgentHost | undefined {
      const now = Date.now();
      sqlite.transaction(() => {
        sqlite.prepare(`UPDATE agent_hosts SET enabled = ?, updated_at = ? WHERE id = ?`).run(enabled ? 1 : 0, now, id);
        if (!enabled) sqlite.prepare(`UPDATE runtime_connections SET enabled = 0, updated_at = ? WHERE host_id = ?`).run(now, id);
        sqlite.prepare(`INSERT INTO audit_logs (id, operator_id, action, target_type, target_id, detail_json, created_at) VALUES (?, ?, ?, 'agent_host', ?, '{}', ?)`).run(randomUUID(), operatorId, enabled ? "agent_host.enabled" : "agent_host.disabled", id, now);
      })();
      return this.get(id);
    },
  };
}
