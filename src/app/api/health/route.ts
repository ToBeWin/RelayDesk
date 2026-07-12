import { NextResponse } from "next/server";
import { config } from "@/infrastructure/config/env";
import { createDatabase } from "@/infrastructure/db/client";
import { ensureStorageDirectories } from "@/infrastructure/storage/files";
import { getRuntimeConnector } from "@/runtime/registry";
import { logError } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { sqlite } = createDatabase();
    sqlite.prepare("SELECT 1").get();
    sqlite.close();
    await ensureStorageDirectories(config.dataDir);
    const connector = getRuntimeConnector(); const runtimeHealth = await connector.healthCheck();
    const capabilities = runtimeHealth.status === "healthy" ? await connector.getCapabilities().catch(() => undefined) : undefined;
    const securityDegraded = !config.credentialsKeyConfigured;
    return NextResponse.json({ status: runtimeHealth.status === "healthy" && !securityDegraded ? "ok" : "degraded", database: "ok", storage: "ok", security: { dedicatedCredentialsKey: config.credentialsKeyConfigured, warning: securityDegraded ? "请配置独立的 RELAYDESK_CREDENTIALS_KEY 后再托管 Agent 密钥" : undefined }, runtime: { ...runtimeHealth, type: connector.type, capabilities }, timestamp: new Date().toISOString() });
  } catch (error) {
    logError("health.check.failed", error);
    return NextResponse.json({ status: "error", message: process.env.NODE_ENV === "production" ? "健康检查失败，请查看服务日志" : error instanceof Error ? error.message : "Unknown health check failure" }, { status: 503 });
  }
}
