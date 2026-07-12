import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "rm -rf .tmp/e2e-data .next/standalone/.tmp/e2e-data .next/standalone/.next/static .next/standalone/public && mkdir -p .next/standalone/.next && cp -R .next/static .next/standalone/.next/static && cp -R public .next/standalone/public && RELAYDESK_RUNTIME_TYPE=mock RELAYDESK_DATA_DIR=\"$PWD/.tmp/e2e-data\" RELAYDESK_PASSWORD=relaydesk-e2e-password RELAYDESK_SESSION_SECRET=relaydesk-e2e-session-secret-at-least-32-characters RELAYDESK_CREDENTIALS_KEY=relaydesk-e2e-credentials-key-at-least-32-characters HOSTNAME=127.0.0.1 PORT=3100 node .next/standalone/server.js",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
