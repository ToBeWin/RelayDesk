import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";

const urlSchema = z
  .string()
  .url()
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "must use http or https");

const schema = z.object({
  RELAYDESK_NAME: z.string().min(1).default("RelayDesk"),
  RELAYDESK_HOST: z.string().min(1).default("0.0.0.0"),
  RELAYDESK_PORT: z.coerce.number().int().positive().default(3000),
  RELAYDESK_PASSWORD: z.string().min(1).default("relaydesk-dev-password"),
  RELAYDESK_SESSION_SECRET: z.string().min(32).default("relaydesk-development-session-secret-change-me"),
  RELAYDESK_CREDENTIALS_KEY: z.string().min(32).optional(),
  RELAYDESK_COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  RELAYDESK_DATA_DIR: z.string().min(1).default(path.join(/* turbopackIgnore: true */ process.cwd(), "data")),
  RELAYDESK_DATABASE_PATH: z.string().min(1).optional(),
  RELAYDESK_STORAGE_CONFIG_PATH: z.string().min(1).default(path.join(/* turbopackIgnore: true */ process.cwd(), "relaydesk-storage.json")),
  RELAYDESK_CONTENT_WORKSPACE_ENABLED: z.enum(["true", "false"]).default("true"),
  RELAYDESK_RUNTIME_TYPE: z.enum(["hermes", "openclaw", "mock"]).default("mock"),
  RELAYDESK_HERMES_BASE_URL: urlSchema.optional(),
  RELAYDESK_HERMES_API_KEY: z.string().min(1).optional(),
  RELAYDESK_HERMES_TIMEOUT_MS: z.coerce.number().int().positive().max(300_000).default(120_000),
  RELAYDESK_RUNTIME_SHARED_PATHS: z.string().default(""),
  RELAYDESK_RUNTIME_ALLOWED_HOSTS: z.string().default("127.0.0.1,localhost,::1,host.docker.internal"),
  RELAYDESK_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(50 * 1024 * 1024),
  RELAYDESK_MAX_IMAGE_BYTES: z.coerce.number().int().positive().default(20 * 1024 * 1024),
  RELAYDESK_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type RelayDeskConfig = {
  name: string;
  host: string;
  port: number;
  password: string;
  sessionSecret: string;
  credentialsKey: string;
  credentialsKeyConfigured: boolean;
  cookieSecure: boolean;
  dataDir: string;
  databasePath: string;
  storageConfigPath: string;
  contentWorkspaceEnabled: boolean;
  runtimeType: "hermes" | "openclaw" | "mock";
  hermesBaseUrl?: string;
  hermesApiKey?: string;
  hermesTimeoutMs: number;
  runtimeSharedPaths: string[];
  runtimeAllowedHosts: string[];
  maxUploadBytes: number;
  maxImageBytes: number;
  logLevel: "debug" | "info" | "warn" | "error";
};

type StorageOverride = { dataDir?: string; databasePath?: string };

function readStorageOverride(configPath: string): StorageOverride {
  if (!existsSync(configPath)) return {};
  try {
    const value = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
    if (!value || typeof value !== "object") return {};
    const data = value as Record<string, unknown>;
    return {
      dataDir: typeof data.dataDir === "string" && data.dataDir.trim() ? data.dataDir : undefined,
      databasePath: typeof data.databasePath === "string" && data.databasePath.trim() ? data.databasePath : undefined,
    };
  } catch {
    throw new Error("Invalid RelayDesk storage configuration file");
  }
}

export function parseConfig(input: Record<string, string | undefined> = process.env): RelayDeskConfig {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid RelayDesk configuration: ${fields}`);
  }
  if (parsed.data.RELAYDESK_RUNTIME_TYPE === "hermes" && !parsed.data.RELAYDESK_HERMES_BASE_URL) {
    throw new Error("Invalid RelayDesk configuration: RELAYDESK_HERMES_BASE_URL is required for Hermes");
  }
  // `next build` evaluates server modules with NODE_ENV=production before a
  // deployment environment injects secrets. Enforce this at runtime, not build.
  if (input.NODE_ENV === "production" && input.NEXT_PHASE !== "phase-production-build" && (!input.RELAYDESK_PASSWORD || !input.RELAYDESK_SESSION_SECRET || !input.RELAYDESK_CREDENTIALS_KEY)) {
    throw new Error("Invalid RelayDesk configuration: production requires RELAYDESK_PASSWORD, RELAYDESK_SESSION_SECRET and RELAYDESK_CREDENTIALS_KEY");
  }
  const storageConfigPath = path.resolve(/* turbopackIgnore: true */ parsed.data.RELAYDESK_STORAGE_CONFIG_PATH);
  const override = readStorageOverride(storageConfigPath);
  const dataDir = path.resolve(/* turbopackIgnore: true */ override.dataDir ?? parsed.data.RELAYDESK_DATA_DIR);
  const databasePath = path.resolve(/* turbopackIgnore: true */ override.databasePath ?? parsed.data.RELAYDESK_DATABASE_PATH ?? path.join(dataDir, "relaydesk.db"));
  const runtimeAllowedHosts = parsed.data.RELAYDESK_RUNTIME_ALLOWED_HOSTS.split(",").map((value) => value.trim().toLocaleLowerCase()).filter(Boolean);
  if (parsed.data.RELAYDESK_HERMES_BASE_URL && !runtimeAllowedHosts.includes(new URL(parsed.data.RELAYDESK_HERMES_BASE_URL).hostname.toLocaleLowerCase())) throw new Error("Invalid RelayDesk configuration: RELAYDESK_HERMES_BASE_URL host is not allowed");
  return {
    name: parsed.data.RELAYDESK_NAME,
    host: parsed.data.RELAYDESK_HOST,
    port: parsed.data.RELAYDESK_PORT,
    password: parsed.data.RELAYDESK_PASSWORD,
    sessionSecret: parsed.data.RELAYDESK_SESSION_SECRET,
    credentialsKey: parsed.data.RELAYDESK_CREDENTIALS_KEY ?? parsed.data.RELAYDESK_SESSION_SECRET,
    credentialsKeyConfigured: Boolean(parsed.data.RELAYDESK_CREDENTIALS_KEY),
    cookieSecure: parsed.data.RELAYDESK_COOKIE_SECURE === "true",
    dataDir,
    databasePath,
    storageConfigPath,
    contentWorkspaceEnabled: parsed.data.RELAYDESK_CONTENT_WORKSPACE_ENABLED === "true",
    runtimeType: parsed.data.RELAYDESK_RUNTIME_TYPE,
    hermesBaseUrl: parsed.data.RELAYDESK_HERMES_BASE_URL,
    hermesApiKey: parsed.data.RELAYDESK_HERMES_API_KEY,
    hermesTimeoutMs: parsed.data.RELAYDESK_HERMES_TIMEOUT_MS,
    runtimeSharedPaths: parsed.data.RELAYDESK_RUNTIME_SHARED_PATHS.split(",").map((value) => value.trim()).filter(Boolean).map((value) => path.resolve(/* turbopackIgnore: true */ value)),
    runtimeAllowedHosts,
    maxUploadBytes: parsed.data.RELAYDESK_MAX_UPLOAD_BYTES,
    maxImageBytes: parsed.data.RELAYDESK_MAX_IMAGE_BYTES,
    logLevel: parsed.data.RELAYDESK_LOG_LEVEL,
  };
}

export const config = parseConfig();
