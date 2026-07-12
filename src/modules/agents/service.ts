import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { config } from "@/infrastructure/config/env";

export type AgentPermission = "chat" | "upload" | "view_history";
const publicCorePermissions: AgentPermission[] = ["chat", "upload", "view_history"];
export type AgentInstance = { id: string; name: string; type: string; baseUrl: string; workspaceLabel: string; profileName: string; hostId: string | null; hostName: string | null; sharingMode: "shared" | "dedicated"; credentialMode: "managed" | "environment" | "default"; attachmentSupport: "files" | "images_only"; permissions: AgentPermission[]; enabled: boolean };

const defaultInstanceId = "hermes-default";
const attachmentSupportFor = (baseUrl: string): "files" | "images_only" => {
  const hostname = new URL(baseUrl).hostname.toLowerCase();
  return ["127.0.0.1", "localhost", "::1"].includes(hostname) ? "files" : "images_only";
};

export function createAgentService(sqlite: Database.Database) {
  const ensureDefaultInstance = () => {
    if (config.runtimeType === "openclaw") return;
    const now = Date.now();
    const type = config.runtimeType; const name = type === "hermes" ? "默认 Hermes Agent" : "Mock Runtime"; const baseUrl = type === "hermes" ? config.hermesBaseUrl! : "mock://local";
    const hostId = "host-local-default";
    sqlite.prepare(`INSERT OR IGNORE INTO agent_hosts (id, name, address, description, enabled, created_at, updated_at) VALUES (?, '本机 Hermes', '127.0.0.1', '由 RelayDesk 默认配置自动创建', 1, ?, ?)`).run(hostId, now, now);
    sqlite.prepare(`INSERT INTO runtime_connections (id, type, name, base_url, host_id, profile_name, config_json, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?) ON CONFLICT(id) DO UPDATE SET type = excluded.type, name = excluded.name, base_url = excluded.base_url, host_id = COALESCE(runtime_connections.host_id, excluded.host_id), profile_name = COALESCE(runtime_connections.profile_name, excluded.profile_name), updated_at = excluded.updated_at`)
      .run(defaultInstanceId, type, name, baseUrl, hostId, type === "hermes" ? "default" : "test", JSON.stringify({ workspaceLabel: type === "hermes" ? "default" : "test" }), now, now);
  };

  return {
    ensureDefaultInstance,
    grantDefaultAccess(operatorId: string) {
      ensureDefaultInstance();
      if (config.runtimeType === "openclaw") return;
      const now = Date.now();
      sqlite.prepare(`INSERT INTO operator_runtime_access (id, operator_id, runtime_connection_id, enabled, permissions_json, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?) ON CONFLICT(operator_id, runtime_connection_id) DO UPDATE SET enabled = 1, permissions_json = excluded.permissions_json, updated_at = excluded.updated_at`)
        .run(randomUUID(), operatorId, defaultInstanceId, JSON.stringify(publicCorePermissions), now, now);
    },
    listAuthorized(operatorId: string): AgentInstance[] {
      ensureDefaultInstance();
      return sqlite.prepare(`SELECT runtime_connections.id, runtime_connections.name, runtime_connections.type, runtime_connections.base_url as baseUrl, runtime_connections.host_id as hostId, agent_hosts.name as hostName, runtime_connections.profile_name as profileName, runtime_connections.sharing_mode as sharingMode, runtime_connections.credential_ciphertext as credentialCiphertext, runtime_connections.config_json as configJson, operator_runtime_access.permissions_json as permissionsJson, runtime_connections.enabled FROM runtime_connections INNER JOIN operator_runtime_access ON operator_runtime_access.runtime_connection_id = runtime_connections.id LEFT JOIN agent_hosts ON agent_hosts.id = runtime_connections.host_id WHERE operator_runtime_access.operator_id = ? AND operator_runtime_access.enabled = 1 AND runtime_connections.enabled = 1 AND COALESCE(agent_hosts.enabled, 1) = 1 ORDER BY agent_hosts.name, runtime_connections.name`).all(operatorId).map((row) => {
        const item = row as { id: string; name: string; type: string; baseUrl: string; hostId: string | null; hostName: string | null; profileName: string | null; sharingMode: "shared" | "dedicated"; credentialCiphertext: string | null; configJson: string; permissionsJson: string; enabled: number };
        let workspaceLabel = ""; try { workspaceLabel = (JSON.parse(item.configJson) as { workspaceLabel?: string }).workspaceLabel ?? ""; } catch { /* Invalid legacy config is not allowed to break agent selection. */ }
        let apiKeyEnv: string | undefined; try { apiKeyEnv = (JSON.parse(item.configJson) as { apiKeyEnv?: string }).apiKeyEnv; } catch { /* Legacy config. */ }
        let permissions: AgentPermission[] = []; try { permissions = (JSON.parse(item.permissionsJson) as string[]).filter((permission): permission is AgentPermission => publicCorePermissions.includes(permission as AgentPermission)); } catch { /* Invalid grants resolve to no access. */ }
        return { id: item.id, name: item.name, type: item.type, baseUrl: item.baseUrl, workspaceLabel, profileName: item.profileName ?? workspaceLabel, hostId: item.hostId, hostName: item.hostName, sharingMode: item.sharingMode, credentialMode: item.credentialCiphertext ? "managed" as const : apiKeyEnv ? "environment" as const : "default" as const, attachmentSupport: attachmentSupportFor(item.baseUrl), permissions, enabled: Boolean(item.enabled) };
      });
    },
    canUse(operatorId: string, runtimeConnectionId: string): boolean {
      return this.canAccess(operatorId, runtimeConnectionId, "chat");
    },
    canAccess(operatorId: string, runtimeConnectionId: string, permission: AgentPermission): boolean { const row = sqlite.prepare(`SELECT operator_runtime_access.permissions_json as permissionsJson FROM operator_runtime_access INNER JOIN runtime_connections ON runtime_connections.id = operator_runtime_access.runtime_connection_id LEFT JOIN agent_hosts ON agent_hosts.id = runtime_connections.host_id WHERE operator_runtime_access.operator_id = ? AND operator_runtime_access.runtime_connection_id = ? AND operator_runtime_access.enabled = 1 AND runtime_connections.enabled = 1 AND COALESCE(agent_hosts.enabled, 1) = 1`).get(operatorId, runtimeConnectionId) as { permissionsJson: string } | undefined; if (!row) return false; try { return (JSON.parse(row.permissionsJson) as string[]).includes(permission); } catch { return false; } },
    listAll(): AgentInstance[] {
      ensureDefaultInstance();
      return sqlite.prepare(`SELECT runtime_connections.id, runtime_connections.name, runtime_connections.type, runtime_connections.base_url as baseUrl, runtime_connections.host_id as hostId, agent_hosts.name as hostName, runtime_connections.profile_name as profileName, runtime_connections.sharing_mode as sharingMode, runtime_connections.credential_ciphertext as credentialCiphertext, runtime_connections.config_json as configJson, runtime_connections.enabled FROM runtime_connections LEFT JOIN agent_hosts ON agent_hosts.id = runtime_connections.host_id ORDER BY agent_hosts.name, runtime_connections.name`).all().map((row) => {
        const item = row as { id: string; name: string; type: string; baseUrl: string; hostId: string | null; hostName: string | null; profileName: string | null; sharingMode: "shared" | "dedicated"; credentialCiphertext: string | null; configJson: string; enabled: number }; let workspaceLabel = "";
        try { workspaceLabel = (JSON.parse(item.configJson) as { workspaceLabel?: string }).workspaceLabel ?? ""; } catch { /* Preserve legacy connections. */ }
        let apiKeyEnv: string | undefined; try { apiKeyEnv = (JSON.parse(item.configJson) as { apiKeyEnv?: string }).apiKeyEnv; } catch { /* Legacy config. */ }
        return { id: item.id, name: item.name, type: item.type, baseUrl: item.baseUrl, workspaceLabel, profileName: item.profileName ?? workspaceLabel, hostId: item.hostId, hostName: item.hostName, sharingMode: item.sharingMode, credentialMode: item.credentialCiphertext ? "managed" as const : apiKeyEnv ? "environment" as const : "default" as const, attachmentSupport: attachmentSupportFor(item.baseUrl), permissions: [], enabled: Boolean(item.enabled) };
      });
    },
    setAccess(operatorId: string, grants: { runtimeConnectionId: string; permissions: AgentPermission[] }[], grantedByOperatorId: string) {
      if (grants.some((grant) => grant.permissions.some((permission) => !publicCorePermissions.includes(permission)))) throw new Error("Unsupported public-core permission");
      const runtimeConnectionIds = grants.map((grant) => grant.runtimeConnectionId);
      const now = Date.now(); const transaction = sqlite.transaction(() => {
        for (const runtimeConnectionId of runtimeConnectionIds) {
          const dedicated = sqlite.prepare(`SELECT 1 FROM runtime_connections WHERE id = ? AND sharing_mode = 'dedicated'`).get(runtimeConnectionId);
          const otherMember = sqlite.prepare(`SELECT 1 FROM operator_runtime_access WHERE runtime_connection_id = ? AND operator_id <> ? AND enabled = 1`).get(runtimeConnectionId, operatorId);
          if (dedicated && otherMember) throw new Error("独占 Agent 已分配给其他成员");
        }
        sqlite.prepare(`UPDATE operator_runtime_access SET enabled = 0, updated_at = ? WHERE operator_id = ?`).run(now, operatorId);
        for (const grant of grants) sqlite.prepare(`INSERT INTO operator_runtime_access (id, operator_id, runtime_connection_id, enabled, permissions_json, granted_by_operator_id, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?) ON CONFLICT(operator_id, runtime_connection_id) DO UPDATE SET enabled = 1, permissions_json = excluded.permissions_json, granted_by_operator_id = excluded.granted_by_operator_id, updated_at = excluded.updated_at`).run(randomUUID(), operatorId, grant.runtimeConnectionId, JSON.stringify(grant.permissions), grantedByOperatorId, now, now);
        sqlite.prepare(`INSERT INTO audit_logs (id, operator_id, action, target_type, target_id, detail_json, created_at) VALUES (?, ?, 'member.agent_access.updated', 'operator', ?, ?, ?)`).run(randomUUID(), grantedByOperatorId, operatorId, JSON.stringify({ grants }), now);
      }); transaction();
      return this.listAuthorized(operatorId);
    },
    create(input: { name: string; baseUrl: string; profileName: string; hostId: string; sharingMode: "shared" | "dedicated"; apiKeyEnv?: string; credentialCiphertext?: string }, operatorId: string): AgentInstance {
      const host = sqlite.prepare(`SELECT id, enabled FROM agent_hosts WHERE id = ?`).get(input.hostId) as { id: string; enabled: number } | undefined; if (!host?.enabled) throw new Error("Agent Host 不存在或已停用");
      const id = randomUUID(); const now = Date.now(); const configJson = JSON.stringify({ workspaceLabel: input.profileName, ...(input.apiKeyEnv ? { apiKeyEnv: input.apiKeyEnv } : {}) });
      sqlite.transaction(() => {
        sqlite.prepare(`INSERT INTO runtime_connections (id, type, name, base_url, host_id, profile_name, credential_ciphertext, sharing_mode, config_json, enabled, created_at, updated_at) VALUES (?, 'hermes', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).run(id, input.name, input.baseUrl.replace(/\/$/, ""), input.hostId, input.profileName, input.credentialCiphertext ?? null, input.sharingMode, configJson, now, now);
        sqlite.prepare(`INSERT INTO audit_logs (id, operator_id, action, target_type, target_id, detail_json, created_at) VALUES (?, ?, 'agent.created', 'runtime_connection', ?, ?, ?)`).run(randomUUID(), operatorId, id, JSON.stringify({ name: input.name, profileName: input.profileName, hostId: input.hostId, sharingMode: input.sharingMode }), now);
      })();
      return this.listAll().find((agent) => agent.id === id)!;
    },
    setEnabled(id: string, enabled: boolean, operatorId: string): AgentInstance | undefined { const now = Date.now(); let changed = false; sqlite.transaction(() => { const result = sqlite.prepare(`UPDATE runtime_connections SET enabled = ?, updated_at = ? WHERE id = ? AND id <> ?`).run(enabled ? 1 : 0, now, id, defaultInstanceId); changed = Boolean(result.changes); if (changed) sqlite.prepare(`INSERT INTO audit_logs (id, operator_id, action, target_type, target_id, detail_json, created_at) VALUES (?, ?, ?, 'runtime_connection', ?, '{}', ?)`).run(randomUUID(), operatorId, enabled ? "agent.enabled" : "agent.disabled", id, now); })(); return changed ? this.listAll().find((agent) => agent.id === id) : undefined; },
    update(id: string, input: { name?: string; sharingMode?: "shared" | "dedicated"; credentialCiphertext?: string }, operatorId: string): AgentInstance | undefined {
      const current = this.listAll().find((agent) => agent.id === id); if (!current) return undefined;
      if (input.sharingMode === "dedicated") { const count = (sqlite.prepare(`SELECT COUNT(*) as count FROM operator_runtime_access WHERE runtime_connection_id = ? AND enabled = 1`).get(id) as { count: number }).count; if (count > 1) throw new Error("已有多个成员使用该 Agent，不能直接改为独占模式"); }
      const now = Date.now(); sqlite.transaction(() => {
        sqlite.prepare(`UPDATE runtime_connections SET name = ?, sharing_mode = ?, credential_ciphertext = COALESCE(?, credential_ciphertext), updated_at = ? WHERE id = ?`).run(input.name?.trim() || current.name, input.sharingMode ?? current.sharingMode, input.credentialCiphertext ?? null, now, id);
        sqlite.prepare(`INSERT INTO audit_logs (id, operator_id, action, target_type, target_id, detail_json, created_at) VALUES (?, ?, 'agent.updated', 'runtime_connection', ?, ?, ?)`).run(randomUUID(), operatorId, id, JSON.stringify({ nameChanged: Boolean(input.name), sharingMode: input.sharingMode, credentialRotated: Boolean(input.credentialCiphertext) }), now);
      })(); return this.listAll().find((agent) => agent.id === id);
    },
  };
}
