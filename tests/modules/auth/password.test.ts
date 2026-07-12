import { describe, expect, it } from "vitest";
import { verifyWorkspacePassword } from "@/modules/auth/password";

describe("verifyWorkspacePassword", () => {
  it("only accepts an exact password match", () => {
    expect(verifyWorkspacePassword("relaydesk-secret", "relaydesk-secret")).toBe(true);
    expect(verifyWorkspacePassword("relaydesk-secret", "relaydesk-secret-no")).toBe(false);
  });
});
