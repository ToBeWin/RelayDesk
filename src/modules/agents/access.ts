import type Database from "better-sqlite3";
import { createAgentService, type AgentPermission } from "@/modules/agents/service";

export function canAccessConversation(sqlite: Database.Database, operatorId: string, conversationId: string, permission: AgentPermission): boolean {
  const row = sqlite.prepare(`SELECT runtime_connection_id as runtimeConnectionId FROM conversations WHERE id = ? AND owner_operator_id = ?`).get(conversationId, operatorId) as { runtimeConnectionId: string } | undefined;
  return Boolean(row && createAgentService(sqlite).canAccess(operatorId, row.runtimeConnectionId, permission));
}

export function canAccessContent(sqlite: Database.Database, operatorId: string, contentId: string, permission: AgentPermission = "manage_content"): boolean {
  const row = sqlite.prepare(`SELECT conversations.runtime_connection_id as runtimeConnectionId FROM content_records INNER JOIN conversations ON conversations.id = content_records.conversation_id WHERE content_records.id = ? AND content_records.created_by_operator_id = ? AND conversations.owner_operator_id = ?`).get(contentId, operatorId, operatorId) as { runtimeConnectionId: string } | undefined;
  return Boolean(row && createAgentService(sqlite).canAccess(operatorId, row.runtimeConnectionId, permission));
}
