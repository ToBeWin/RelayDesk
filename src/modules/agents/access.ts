import type Database from "better-sqlite3";
import { createAgentService, type AgentPermission } from "@/modules/agents/service";

export function canAccessConversation(sqlite: Database.Database, operatorId: string, conversationId: string, permission: AgentPermission): boolean {
  const row = sqlite.prepare(`SELECT runtime_connection_id as runtimeConnectionId FROM conversations WHERE id = ? AND owner_operator_id = ?`).get(conversationId, operatorId) as { runtimeConnectionId: string } | undefined;
  return Boolean(row && createAgentService(sqlite).canAccess(operatorId, row.runtimeConnectionId, permission));
}
