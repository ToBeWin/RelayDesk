import { config } from "@/infrastructure/config/env";

type LogContext = Record<string, string | number | boolean | null | undefined>;

function errorSummary(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message };
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; message?: unknown };
    return { name: typeof value.code === "string" ? value.code : "RuntimeError", message: typeof value.message === "string" ? value.message : "Unknown runtime failure" };
  }
  return { name: "UnknownError", message: typeof error === "string" ? error : "Unknown failure" };
}

export function logError(event: string, error: unknown, context: LogContext = {}): void {
  if (config.logLevel === "error" || config.logLevel === "warn" || config.logLevel === "info" || config.logLevel === "debug") {
    // Do not pass request bodies, credentials, or runtime raw payloads here.
    console.error(JSON.stringify({ level: "error", event, ...context, error: errorSummary(error), timestamp: new Date().toISOString() }));
  }
}
