import { describe, expect, it } from "vitest";
import { isSameOrigin } from "@/shared/http/origin";

describe("isSameOrigin", () => {
  it("accepts a browser origin that matches the request Host", () => {
    const request = new Request("http://localhost:3000/api/auth/login", { headers: { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" } });
    expect(isSameOrigin(request)).toBe(true);
  });

  it("rejects a cross-site origin", () => {
    const request = new Request("http://localhost:3000/api/auth/login", { headers: { origin: "https://attacker.example", host: "localhost:3000" } });
    expect(isSameOrigin(request)).toBe(false);
  });
});
