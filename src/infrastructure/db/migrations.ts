import type Database from "better-sqlite3";

const migrations = [{
  id: "0000_initial",
  sql: `
    CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS operators (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS runtime_connections (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, base_url TEXT NOT NULL, profile_id TEXT, config_json TEXT NOT NULL DEFAULT '{}', enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, runtime_connection_id TEXT NOT NULL, external_session_id TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS conversations_runtime_session_unique ON conversations(runtime_connection_id, external_session_id);
  `,
}, {
  id: "0001_messages_and_runs",
  sql: `
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, external_message_id TEXT,
      local_client_id TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'text', task_kind TEXT NOT NULL DEFAULT 'chat',
      content_text TEXT NOT NULL DEFAULT '', raw_json TEXT NOT NULL DEFAULT '{}',
      sequence_no INTEGER NOT NULL, operator_id TEXT, external_created_at INTEGER,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      UNIQUE(conversation_id, local_client_id)
    );
    CREATE INDEX IF NOT EXISTS messages_conversation_sequence ON messages(conversation_id, sequence_no);
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, request_message_id TEXT,
      response_message_id TEXT, external_run_id TEXT, status TEXT NOT NULL,
      error_code TEXT, error_message TEXT, usage_json TEXT NOT NULL DEFAULT '{}',
      started_at INTEGER, completed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS run_events (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL, sequence_no INTEGER NOT NULL,
      event_type TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL
    );
  `,
}, {
  id: "0002_content_assets_schedule",
  sql: `
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY, conversation_id TEXT, message_id TEXT, run_id TEXT,
      external_asset_id TEXT, asset_type TEXT NOT NULL, source TEXT NOT NULL, original_name TEXT,
      stored_name TEXT NOT NULL, relative_path TEXT NOT NULL, mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, width INTEGER, height INTEGER,
      metadata_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS assets_sha256 ON assets(sha256);
  `,
}, {
  id: "0003_private_agent_access",
  sql: `
    ALTER TABLE conversations ADD COLUMN owner_operator_id TEXT;
    CREATE INDEX IF NOT EXISTS conversations_owner_updated ON conversations(owner_operator_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS operator_runtime_access (
      id TEXT PRIMARY KEY,
      operator_id TEXT NOT NULL,
      runtime_connection_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      granted_by_operator_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(operator_id, runtime_connection_id)
    );
    CREATE INDEX IF NOT EXISTS operator_runtime_access_operator ON operator_runtime_access(operator_id, enabled);
  `,
}, {
  id: "0004_member_credentials",
  sql: `
    ALTER TABLE operators ADD COLUMN password_hash TEXT;
    ALTER TABLE operators ADD COLUMN role TEXT NOT NULL DEFAULT 'member';
    CREATE INDEX IF NOT EXISTS operators_role_active ON operators(role, active);
  `,
}, {
  id: "0005_private_assets",
  sql: `
    ALTER TABLE assets ADD COLUMN owner_operator_id TEXT;
    UPDATE assets SET owner_operator_id = (SELECT owner_operator_id FROM conversations WHERE conversations.id = assets.conversation_id) WHERE conversation_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS assets_owner_created ON assets(owner_operator_id, created_at DESC);
  `,
}, {
  id: "0006_settings_and_quick_actions",
  sql: `
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at INTEGER NOT NULL
    );
  `,
}, {
  id: "0007_conversation_sync_metadata",
  sql: `
    ALTER TABLE conversations ADD COLUMN profile_id TEXT;
    ALTER TABLE conversations ADD COLUMN sync_cursor TEXT;
    ALTER TABLE conversations ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'idle';
    ALTER TABLE conversations ADD COLUMN last_synced_at INTEGER;
    ALTER TABLE conversations ADD COLUMN last_message_at INTEGER;
  `,
}, {
  id: "0008_agent_hosts_and_credentials",
  sql: `
    CREATE TABLE IF NOT EXISTS agent_hosts (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL UNIQUE,
      description TEXT, enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    ALTER TABLE runtime_connections ADD COLUMN host_id TEXT;
    ALTER TABLE runtime_connections ADD COLUMN profile_name TEXT;
    ALTER TABLE runtime_connections ADD COLUMN credential_ciphertext TEXT;
    ALTER TABLE runtime_connections ADD COLUMN sharing_mode TEXT NOT NULL DEFAULT 'shared';
    CREATE INDEX IF NOT EXISTS runtime_connections_host ON runtime_connections(host_id, enabled);
    ALTER TABLE operator_runtime_access ADD COLUMN permissions_json TEXT NOT NULL DEFAULT '["chat","upload","view_history"]';
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY, operator_id TEXT, action TEXT NOT NULL,
      target_type TEXT NOT NULL, target_id TEXT, detail_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audit_logs_created ON audit_logs(created_at DESC);
  `,
}, {
  id: "0009_conversation_organization",
  sql: `
    ALTER TABLE conversations ADD COLUMN pinned_at INTEGER;
    ALTER TABLE conversations ADD COLUMN deleted_at INTEGER;
    CREATE INDEX IF NOT EXISTS conversations_owner_organization ON conversations(owner_operator_id, deleted_at, pinned_at DESC, updated_at DESC);
  `,
}, {
  id: "0010_runtime_jobs",
  sql: `
    CREATE TABLE IF NOT EXISTS runtime_jobs (
      id TEXT PRIMARY KEY, runtime_connection_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL, owner_operator_id TEXT NOT NULL,
      external_job_id TEXT NOT NULL, name TEXT NOT NULL, schedule TEXT NOT NULL,
      prompt TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
      last_run_key TEXT, last_delivered_at INTEGER,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      UNIQUE(runtime_connection_id, external_job_id)
    );
    CREATE INDEX IF NOT EXISTS runtime_jobs_owner_updated ON runtime_jobs(owner_operator_id, updated_at DESC);
  `,
}, {
  id: "0011_public_core_permissions",
  sql: `
    UPDATE operator_runtime_access
    SET permissions_json = '["chat","upload","view_history"]';
  `,
}];

export function applyMigrations(sqlite: Database.Database): void {
  sqlite.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
  const applied = sqlite.prepare("SELECT id FROM schema_migrations WHERE id = ?");
  const record = sqlite.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)");
  const transaction = sqlite.transaction(() => {
    for (const migration of migrations) {
      if (applied.get(migration.id)) continue;
      sqlite.exec(migration.sql);
      record.run(migration.id, Date.now());
    }
  });
  transaction();
}
