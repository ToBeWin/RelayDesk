import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { config } from "@/infrastructure/config/env";
import { decryptCredential } from "@/infrastructure/security/credentials";

export const runtime = "nodejs";

export async function POST() {
  const operatorId = await getCurrentOperatorId(); if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const { sqlite } = createDatabase(); let delivered = 0;
  try {
    const jobs = sqlite.prepare("SELECT runtime_jobs.*, runtime_connections.base_url as baseUrl, runtime_connections.credential_ciphertext as credentialCiphertext, runtime_connections.config_json as configJson FROM runtime_jobs INNER JOIN runtime_connections ON runtime_connections.id = runtime_jobs.runtime_connection_id WHERE runtime_jobs.owner_operator_id = ? AND runtime_jobs.status = 'active'").all(operatorId) as { id: string; conversation_id: string; external_job_id: string; last_run_key: string | null; baseUrl: string; credentialCiphertext: string | null; configJson: string }[];
    for (const job of jobs) {
      let key = job.credentialCiphertext ? decryptCredential(job.credentialCiphertext) : undefined; try { const envKey = (JSON.parse(job.configJson) as { apiKeyEnv?: string }).apiKeyEnv; key ||= envKey ? process.env[envKey] : config.hermesApiKey; } catch { key ||= config.hermesApiKey; }
      const response = await fetch(`${job.baseUrl.replace(/\/$/, "")}/api/jobs/${job.external_job_id}`, { headers: key ? { Authorization: `Bearer ${key}` } : {} }); if (!response.ok) continue;
      const payload = await response.json() as Record<string, unknown>; const record = (payload.job ?? payload) as Record<string, unknown>; const run = (record.last_run ?? record.lastRun) as Record<string, unknown> | undefined; const runKey = typeof run?.id === "string" ? run.id : typeof run?.completed_at === "string" ? run.completed_at : undefined; const output = typeof run?.output === "string" ? run.output : typeof run?.result === "string" ? run.result : undefined;
      if (!runKey || !output || runKey === job.last_run_key) continue;
      const now = Date.now(); const sequence = (sqlite.prepare("SELECT COALESCE(MAX(sequence_no), 0) as value FROM messages WHERE conversation_id = ?").get(job.conversation_id) as { value: number }).value;
      sqlite.transaction(() => { sqlite.prepare("INSERT INTO messages (id, conversation_id, local_client_id, role, status, task_kind, content_text, sequence_no, created_at, updated_at) VALUES (?, ?, ?, 'assistant', 'completed', 'scheduled_job', ?, ?, ?, ?)").run(randomUUID(), job.conversation_id, `job-${job.id}-${runKey}`, `定时任务提醒\n\n${output}`, sequence + 1, now, now); sqlite.prepare("UPDATE runtime_jobs SET last_run_key = ?, last_delivered_at = ?, updated_at = ? WHERE id = ?").run(runKey, now, now, job.id); })(); delivered += 1;
    }
    return NextResponse.json({ delivered });
  } finally { sqlite.close(); }
}
