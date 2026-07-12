import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { assertPathInsideRoot, sha256, writeControlledStream } from "@/infrastructure/storage/files";

describe("controlled storage", () => {
  it("rejects paths outside the managed root", () => {
    expect(() => assertPathInsideRoot("/srv/relaydesk/data", "/etc/passwd")).toThrow("outside managed storage");
  });

  it("creates stable SHA-256 hashes", () => {
    expect(sha256(Buffer.from("relaydesk"))).toBe("455dd8e22520f2185497d03c90d1da8acf9c884e27c3ef910526250cbdb1aaee");
  });

  it("streams content into managed storage while hashing", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "relaydesk-stream-"));
    const content = new TextEncoder().encode("streamed upload");
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(content.slice(0, 7)); controller.enqueue(content.slice(7)); controller.close(); } });
    const stored = await writeControlledStream({ dataDir, area: "uploads", extension: "txt", maxBytes: 1024, stream });
    await expect(readFile(path.join(dataDir, stored.relativePath), "utf8")).resolves.toBe("streamed upload");
    expect(stored.sizeBytes).toBe(content.byteLength);
    await rm(dataDir, { recursive: true, force: true });
  });

  it("removes partial data when a stream exceeds its limit", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "relaydesk-stream-limit-"));
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(32)); controller.close(); } });
    await expect(writeControlledStream({ dataDir, area: "uploads", extension: "txt", maxBytes: 8, stream })).rejects.toThrow("configured size limit");
    expect(await readdir(path.join(dataDir, "tmp"))).toHaveLength(0);
    await rm(dataDir, { recursive: true, force: true });
  });
});
