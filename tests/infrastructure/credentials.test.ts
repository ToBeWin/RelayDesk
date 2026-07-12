import { describe, expect, it } from "vitest";
import { decryptCredential, encryptCredential } from "@/infrastructure/security/credentials";

describe("managed Agent credentials", () => {
  it("encrypts with authenticated encryption and rejects tampering", () => {
    const encrypted = encryptCredential("hermes-secret-value");
    expect(encrypted).not.toContain("hermes-secret-value");
    expect(decryptCredential(encrypted)).toBe("hermes-secret-value");
    const parts = encrypted.split("."); const ciphertext = Buffer.from(parts[3], "base64url"); ciphertext[0] ^= 1; parts[3] = ciphertext.toString("base64url"); const tampered = parts.join(".");
    expect(() => decryptCredential(tampered)).toThrow();
  });
});
