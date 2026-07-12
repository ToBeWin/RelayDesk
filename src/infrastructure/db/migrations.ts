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
    CREATE TABLE IF NOT EXISTS content_accounts (
      id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT,
      notes TEXT, default_runtime_connection_id TEXT, default_profile_id TEXT,
      enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY, conversation_id TEXT, message_id TEXT, run_id TEXT, content_record_id TEXT,
      external_asset_id TEXT, asset_type TEXT NOT NULL, source TEXT NOT NULL, original_name TEXT,
      stored_name TEXT NOT NULL, relative_path TEXT NOT NULL, mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, width INTEGER, height INTEGER,
      metadata_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS assets_sha256 ON assets(sha256);
    CREATE TABLE IF NOT EXISTS content_records (
      id TEXT PRIMARY KEY, content_account_id TEXT, conversation_id TEXT NOT NULL, source_message_id TEXT NOT NULL,
      title TEXT NOT NULL, body_markdown TEXT NOT NULL, summary TEXT, status TEXT NOT NULL DEFAULT 'draft',
      selected_cover_asset_id TEXT, notes TEXT, created_by_operator_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS content_records_updated ON content_records(updated_at DESC);
    CREATE TABLE IF NOT EXISTS content_reviews (
      id TEXT PRIMARY KEY, content_record_id TEXT NOT NULL, request_message_id TEXT NOT NULL,
      response_message_id TEXT, score INTEGER, result_markdown TEXT, status TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schedule_entries (
      id TEXT PRIMARY KEY, content_record_id TEXT NOT NULL, scheduled_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'planned', notes TEXT, created_by_operator_id TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
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
    CREATE TABLE IF NOT EXISTS quick_actions (
      id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      prompt_template TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO quick_actions (id, key, name, prompt_template, enabled, created_at, updated_at) VALUES
      ('builtin-content-generate', 'content_generate', '生成内容', '请根据当前账号定位和要求生成完整内容，使用清晰 Markdown 输出。', 1, unixepoch() * 1000, unixepoch() * 1000),
      ('builtin-content-self-check', 'content_self_check', '内容自检', '请对以下待发布内容进行发布前自检，并给出修改建议和 0-100 分评分。', 1, unixepoch() * 1000, unixepoch() * 1000),
      ('builtin-cover-generate', 'cover_generate', '生成封面', '请基于当前内容和本次上传的图片生成一张封面，并返回最终图片文件。', 1, unixepoch() * 1000, unixepoch() * 1000),
      ('builtin-cover-regenerate', 'cover_regenerate', '再生成一张', '保持上一版封面的主题、标题、比例和约束，再生成一个明显不同的方案。', 1, unixepoch() * 1000, unixepoch() * 1000),
      ('builtin-context-resync', 'context_resync', '同步当前内容', '请重新读取以下账号信息、内容正文、封面说明和排期，并以此作为后续修改上下文。', 1, unixepoch() * 1000, unixepoch() * 1000);
  `,
}, {
  id: "0007_conversation_sync_metadata",
  sql: `
    ALTER TABLE conversations ADD COLUMN content_account_id TEXT;
    ALTER TABLE conversations ADD COLUMN profile_id TEXT;
    ALTER TABLE conversations ADD COLUMN sync_cursor TEXT;
    ALTER TABLE conversations ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'idle';
    ALTER TABLE conversations ADD COLUMN last_synced_at INTEGER;
    ALTER TABLE conversations ADD COLUMN last_message_at INTEGER;
    CREATE INDEX IF NOT EXISTS conversations_account_updated ON conversations(content_account_id, updated_at DESC);
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
    ALTER TABLE operator_runtime_access ADD COLUMN permissions_json TEXT NOT NULL DEFAULT '["chat","upload","manage_content","view_history"]';
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
