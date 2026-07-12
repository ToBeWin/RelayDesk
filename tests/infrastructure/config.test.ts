import { describe, expect, it } from "vitest";
import { parseConfig } from "@/infrastructure/config/env";

describe("parseConfig", () => {
  it("rejects an invalid runtime base URL", () => {
    expect(() => parseConfig({ RELAYDESK_RUNTIME_TYPE: "hermes", RELAYDESK_HERMES_BASE_URL: "file:///etc/passwd" })).toThrow("RELAYDESK_HERMES_BASE_URL");
  });

  it("uses safe local defaults for the mock runtime", () => {
    const config = parseConfig({ RELAYDESK_PASSWORD: "workspace-secret", RELAYDESK_SESSION_SECRET: "session-secret-at-least-32-characters" });
    expect(config.runtimeType).toBe("mock");
    expect(config.dataDir).toContain("data");
  });

  it("uses non-secure cookies for local HTTP unless HTTPS is explicitly enabled", () => {
    const base = { RELAYDESK_PASSWORD: "workspace-secret", RELAYDESK_SESSION_SECRET: "session-secret-at-least-32-characters" };
    expect(parseConfig(base).cookieSecure).toBe(false);
    expect(parseConfig({ ...base, RELAYDESK_COOKIE_SECURE: "true" }).cookieSecure).toBe(true);
  });

  it("keeps the retired Content Workspace disabled by default", () => {
    const base = { RELAYDESK_PASSWORD: "workspace-secret", RELAYDESK_SESSION_SECRET: "session-secret-at-least-32-characters" };
    expect(parseConfig(base).contentWorkspaceEnabled).toBe(false);
  });

  it("rejects a Hermes host outside the explicit runtime allowlist", () => {
    expect(() => parseConfig({ RELAYDESK_RUNTIME_TYPE: "hermes", RELAYDESK_HERMES_BASE_URL: "http://169.254.169.254", RELAYDESK_RUNTIME_ALLOWED_HOSTS: "127.0.0.1" })).toThrow("host is not allowed");
  });

  it("requires independent secrets in production", () => {
    expect(() => parseConfig({ NODE_ENV: "production", RELAYDESK_PASSWORD: "workspace-secret", RELAYDESK_SESSION_SECRET: "session-secret-at-least-32-characters" })).toThrow("production requires");
    expect(parseConfig({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build", RELAYDESK_PASSWORD: "workspace-secret", RELAYDESK_SESSION_SECRET: "session-secret-at-least-32-characters" }).credentialsKeyConfigured).toBe(false);
    expect(parseConfig({ NODE_ENV: "production", RELAYDESK_PASSWORD: "workspace-secret", RELAYDESK_SESSION_SECRET: "session-secret-at-least-32-characters", RELAYDESK_CREDENTIALS_KEY: "credential-secret-at-least-32-characters" }).credentialsKeyConfigured).toBe(true);
  });
});
