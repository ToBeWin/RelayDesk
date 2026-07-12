import { describe, expect, it } from "vitest";
import { createHermesConnector } from "@/runtime/hermes/connector";

const enabled = process.env.RELAYDESK_RUN_REAL_HERMES_TESTS === "1";
const baseUrl = process.env.RELAYDESK_HERMES_BASE_URL;

describe.skipIf(!enabled || !baseUrl)("real Hermes API integration", () => {
  it("reports a healthy Hermes API server without exposing credentials", async () => {
    const connector = createHermesConnector({
      baseUrl: baseUrl!,
      apiKey: process.env.RELAYDESK_HERMES_API_KEY,
      timeoutMs: 15_000,
    });

    await expect(connector.healthCheck()).resolves.toMatchObject({
      status: "healthy",
    });
  }, 20_000);
});
