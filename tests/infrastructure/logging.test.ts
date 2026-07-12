import { describe, expect, it, vi } from "vitest";
import { logError } from "@/infrastructure/logging/logger";

describe("structured logger", () => {
  it("records only a concise error summary and supplied safe context", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logError("runtime.failed", { code: "RUNTIME_UNAVAILABLE", message: "gateway unavailable", apiKey: "must-not-log" }, { requestId: "request-1", operatorId: "operator-1" });
    const entry = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(entry).toMatchObject({ event: "runtime.failed", requestId: "request-1", operatorId: "operator-1", error: { name: "RUNTIME_UNAVAILABLE", message: "gateway unavailable" } });
    expect(JSON.stringify(entry)).not.toContain("must-not-log");
    spy.mockRestore();
  });
});
