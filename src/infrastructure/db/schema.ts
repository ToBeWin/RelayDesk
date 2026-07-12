import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const operators = sqliteTable("operators", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("member"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const runtimeConnections = sqliteTable("runtime_connections", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  profileId: text("profile_id"),
  hostId: text("host_id"),
  profileName: text("profile_name"),
  credentialCiphertext: text("credential_ciphertext"),
  sharingMode: text("sharing_mode").notNull().default("shared"),
  configJson: text("config_json").notNull().default("{}"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  runtimeConnectionId: text("runtime_connection_id").notNull(),
  contentAccountId: text("content_account_id"),
  externalSessionId: text("external_session_id").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("active"),
  ownerOperatorId: text("owner_operator_id"),
  profileId: text("profile_id"),
  syncCursor: text("sync_cursor"),
  syncStatus: text("sync_status").notNull().default("idle"),
  lastSyncedAt: integer("last_synced_at"),
  lastMessageAt: integer("last_message_at"),
  pinnedAt: integer("pinned_at"),
  deletedAt: integer("deleted_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [uniqueIndex("conversations_runtime_session_unique").on(table.runtimeConnectionId, table.externalSessionId)]);

export const operatorRuntimeAccess = sqliteTable("operator_runtime_access", {
  id: text("id").primaryKey(),
  operatorId: text("operator_id").notNull(),
  runtimeConnectionId: text("runtime_connection_id").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  grantedByOperatorId: text("granted_by_operator_id"),
  permissionsJson: text("permissions_json").notNull().default('["chat","upload","manage_content","view_history"]'),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [uniqueIndex("operator_runtime_access_unique").on(table.operatorId, table.runtimeConnectionId)]);

export const quickActions = sqliteTable("quick_actions", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  promptTemplate: text("prompt_template").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const agentHosts = sqliteTable("agent_hosts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull().unique(),
  description: text("description"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  operatorId: text("operator_id"),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  detailJson: text("detail_json").notNull().default("{}"),
  createdAt: integer("created_at").notNull(),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
