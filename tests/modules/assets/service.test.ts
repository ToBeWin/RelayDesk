import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDatabase } from "@/infrastructure/db/client";
import { createAssetService } from "@/modules/assets/service";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe("asset service", () => {
  it("archives an allowed image under controlled storage", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-asset-")); directories.push(directory);
    const { sqlite } = createDatabase(path.join(directory, "relaydesk.db"));
    const service = createAssetService(sqlite, directory); const asset = await service.archiveUpload({ originalName: "cover.png", mimeType: "image/png", content: Buffer.from("image"), ownerOperatorId: "operator-a" });
    expect(asset.relativePath).toMatch(/^uploads\//);
    expect(asset.sha256).toHaveLength(64);
    expect(service.getAuthorized(asset.id, "operator-a")?.id).toBe(asset.id);
    expect(service.getAuthorized(asset.id, "operator-b")).toBeUndefined();
    sqlite.close();
  });

  it("archives a Hermes media file only from an approved shared directory", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-runtime-asset-")); directories.push(directory);
    const shared = path.join(directory, "shared"); const source = path.join(shared, "result.png");
    mkdirSync(shared); writeFileSync(source, "image");
    const { sqlite } = createDatabase(path.join(directory, "relaydesk.db")); const service = createAssetService(sqlite, directory);
    const asset = await service.archiveRuntimeFile({ absolutePath: source, sharedRoots: [shared], conversationId: "conversation", messageId: "message" });
    expect(asset?.relativePath).toMatch(/^artifacts\//);
    await expect(service.archiveRuntimeFile({ absolutePath: source, sharedRoots: [path.join(directory, "other")], conversationId: "conversation", messageId: "message" })).resolves.toBeUndefined();
    sqlite.close();
  });

  it("accepts common office and media files but rejects mismatched extensions", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-file-types-")); directories.push(directory);
    const { sqlite } = createDatabase(path.join(directory, "relaydesk.db")); const service = createAssetService(sqlite, directory);
    await expect(service.archiveUpload({ originalName: "plan.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", content: Buffer.from("sheet") })).resolves.toMatchObject({ originalName: "plan.xlsx" });
    await expect(service.archiveUpload({ originalName: "clip.mp4", mimeType: "video/mp4", content: Buffer.from("video") })).resolves.toMatchObject({ mimeType: "video/mp4" });
    await expect(service.archiveUpload({ originalName: "fake.png", mimeType: "application/pdf", content: Buffer.from("pdf") })).rejects.toThrow("does not match");
    sqlite.close();
  });

  it("does not expose private uploaded assets to another operator", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-private-assets-")); directories.push(directory);
    const { sqlite } = createDatabase(path.join(directory, "relaydesk.db"));
    const service = createAssetService(sqlite, directory);
    const asset = await service.archiveUpload({ originalName: "private.png", mimeType: "image/png", content: Buffer.from("image"), ownerOperatorId: "operator-a" });
    expect(service.getViewAuthorized(asset.id, "operator-a")?.id).toBe(asset.id);
    expect(service.getViewAuthorized(asset.id, "operator-b")).toBeUndefined();
    sqlite.close();
  });
});
