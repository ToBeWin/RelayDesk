import { createHmac, timingSafeEqual } from "node:crypto";

const encoder = new TextEncoder();

function signature(value: string, secret: string): string { return createHmac("sha256", secret).update(value).digest("base64url"); }

export function createSessionToken(operatorName: string, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ operatorName, exp: Date.now() + 1000 * 60 * 60 * 24 * 14 })).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function readSessionToken(token: string | undefined, secret: string): { operatorName: string } | null {
  if (!token) return null;
  const [payload, provided] = token.split(".");
  if (!payload || !provided) return null;
  const expected = signature(payload, secret);
  const expectedBuffer = encoder.encode(expected);
  const providedBuffer = encoder.encode(provided);
  if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { operatorName: string; exp: number };
    return parsed.exp > Date.now() && parsed.operatorName ? { operatorName: parsed.operatorName } : null;
  } catch { return null; }
}
