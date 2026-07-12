import { config } from "@/infrastructure/config/env";
import type { RuntimeConnector } from "@/runtime/contracts/runtime-connector";
import { createHermesConnector } from "@/runtime/hermes/connector";
import { createMockConnector } from "@/runtime/mock/connector";
import type Database from "better-sqlite3";
import { decryptCredential } from "@/infrastructure/security/credentials";

export function getRuntimeConnector(): RuntimeConnector {
  if (config.runtimeType === "mock") return createMockConnector();
  if (config.runtimeType === "hermes") {
    return createHermesConnector({
      baseUrl: config.hermesBaseUrl!,
      apiKey: config.hermesApiKey,
      timeoutMs: config.hermesTimeoutMs,
      runtimeSharedPaths: config.runtimeSharedPaths,
    });
  }
  throw new Error(`${config.runtimeType} connector is not configured yet`);
}

export function getRuntimeConnectorForConnection(sqlite: Database.Database, runtimeConnectionId: string): RuntimeConnector {
  const row = sqlite.prepare(`SELECT id, type, base_url as baseUrl, credential_ciphertext as credentialCiphertext, config_json as configJson FROM runtime_connections WHERE id = ? AND enabled = 1`).get(runtimeConnectionId) as { id: string; type: string; baseUrl: string; credentialCiphertext: string | null; configJson: string } | undefined;
  if (!row) throw new Error("Agent 实例不存在或已停用");
  if (row.type === "mock") return createMockConnector();
  if (row.type !== "hermes") throw new Error(`Unsupported runtime type: ${row.type}`);
  let apiKeyEnv: string | undefined;
  try { apiKeyEnv = (JSON.parse(row.configJson) as { apiKeyEnv?: string }).apiKeyEnv; } catch { /* Legacy records use the default credential. */ }
  const apiKey = row.credentialCiphertext ? decryptCredential(row.credentialCiphertext) : apiKeyEnv ? process.env[apiKeyEnv] : row.id === "hermes-default" ? config.hermesApiKey : undefined;
  if (apiKeyEnv && !apiKey) throw new Error(`Agent credential environment variable is missing: ${apiKeyEnv}`);
  return createHermesConnector({ baseUrl: row.baseUrl, apiKey, timeoutMs: config.hermesTimeoutMs, runtimeSharedPaths: config.runtimeSharedPaths });
}
