import { describe, expect, it } from "vitest";
import { canAttemptLogin, clearLoginFailures, recordLoginFailure } from "@/modules/auth/login-attempts";

describe("login attempts", () => {
  it("temporarily blocks repeated failures and clears after a successful login", () => {
    const key = "127.0.0.1:member";
    clearLoginFailures(key);
    for (let index = 0; index < 8; index += 1) recordLoginFailure(key, 1_000);
    expect(canAttemptLogin(key, 1_001)).toBe(false);
    clearLoginFailures(key);
    expect(canAttemptLogin(key, 1_001)).toBe(true);
  });
});
