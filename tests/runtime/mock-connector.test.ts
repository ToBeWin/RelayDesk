import { describe, expect, it } from "vitest";
import { createMockConnector } from "@/runtime/mock/connector";

describe("MockConnector", () => {
  it("streams a complete normalized assistant response", async () => {
    const connector = createMockConnector();
    const events = [];
    for await (const event of connector.sendMessage({ sessionId: "session-1", text: "你好" })) events.push(event.type);

    expect(events).toEqual(["run.started", "message.started", "message.delta", "message.completed", "run.completed"]);
  });
});
