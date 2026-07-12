import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import type Database from "better-sqlite3";
import { assertPathInsideRoot, ensureStorageDirectories, writeControlledFile, writeControlledStream } from "@/infrastructure/storage/files";
import { config } from "@/infrastructure/config/env";

const allowedMimeTypes = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "application/pdf", "text/plain", "text/markdown", "text/csv",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg",
  "video/mp4", "video/quicktime", "video/webm",
]);
const mimeByExtension: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".pdf": "application/pdf", ".txt": "text/plain", ".md": "text/markdown", ".csv": "text/csv",
  ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav", ".ogg": "audio/ogg",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
};
export type Asset = { id: string; originalName: string | null; relativePath: string; mimeType: string; sizeBytes: number; sha256: string; createdAt: number; assetType: "image" | "file" };

export function createAssetService(sqlite: Database.Database, dataDir: string) {
  const select = `SELECT id, original_name as originalName, relative_path as relativePath, mime_type as mimeType, size_bytes as sizeBytes, sha256, created_at as createdAt, asset_type as assetType FROM assets`;
  const persist = (input: { originalName: string; mimeType: string; relativePath: string; storedName: string; sha256: string; sizeBytes: number; conversationId?: string; messageId?: string; ownerOperatorId?: string; source?: "upload" | "runtime" }): Asset => {
    const id = randomUUID(); const now = Date.now();
    sqlite.prepare(`INSERT INTO assets (id, conversation_id, message_id, owner_operator_id, asset_type, source, original_name, stored_name, relative_path, mime_type, size_bytes, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.conversationId ?? null, input.messageId ?? null, input.ownerOperatorId ?? null, input.mimeType.startsWith("image/") ? "image" : "file", input.source ?? "upload", input.originalName, input.storedName, input.relativePath, input.mimeType, input.sizeBytes, input.sha256, now);
    return { id, originalName: input.originalName, relativePath: input.relativePath, mimeType: input.mimeType, sizeBytes: input.sizeBytes, sha256: input.sha256, createdAt: now, assetType: input.mimeType.startsWith("image/") ? "image" : "file" };
  };
  const validate = (mimeType: string, sizeBytes: number, originalName?: string) => {
    if (!allowedMimeTypes.has(mimeType)) throw new Error("Unsupported file type");
    if (originalName) {
      const expected = mimeByExtension[path.extname(originalName).toLowerCase()];
      const compatibleText = expected === "text/plain" && (mimeType === "text/plain" || mimeType === "text/markdown");
      if (!expected || (expected !== mimeType && !compatibleText)) throw new Error("File extension does not match MIME type");
    }
    const maxBytes = mimeType.startsWith("image/") ? config.maxImageBytes : config.maxUploadBytes;
    if (sizeBytes > maxBytes) throw new Error(mimeType.startsWith("image/") ? "Image exceeds configured size limit" : "File exceeds configured size limit");
    return maxBytes;
  };
  return { get(id: string) { return sqlite.prepare(`${select} WHERE id = ?`).get(id) as Asset | undefined; }, getAuthorized(id: string, operatorId: string) { return sqlite.prepare(`${select} WHERE id = ? AND (owner_operator_id = ? OR conversation_id IN (SELECT id FROM conversations WHERE owner_operator_id = ?))`).get(id, operatorId, operatorId) as Asset | undefined; }, getViewAuthorized(id: string, operatorId: string) { return sqlite.prepare(`${select} WHERE id = ? AND (owner_operator_id = ? OR conversation_id IN (SELECT id FROM conversations WHERE owner_operator_id = ?))`).get(id, operatorId, operatorId) as Asset | undefined; }, async archiveUpload(input: { originalName: string; mimeType: string; content: Buffer; conversationId?: string; messageId?: string; ownerOperatorId?: string; source?: "upload" | "runtime" }): Promise<Asset> {
    validate(input.mimeType, input.content.byteLength, input.originalName);
    await ensureStorageDirectories(dataDir); const extension = path.extname(input.originalName).slice(1); const stored = await writeControlledFile({ dataDir, area: input.source === "runtime" ? "artifacts" : "uploads", content: input.content, extension });
    return persist({ ...input, ...stored, sizeBytes: input.content.byteLength });
  }, async archiveUploadStream(input: { originalName: string; mimeType: string; sizeBytes: number; stream: ReadableStream<Uint8Array>; ownerOperatorId?: string }): Promise<Asset> {
    const maxBytes = validate(input.mimeType, input.sizeBytes, input.originalName); await ensureStorageDirectories(dataDir);
    const stored = await writeControlledStream({ dataDir, area: "uploads", stream: input.stream, extension: path.extname(input.originalName).slice(1), maxBytes });
    return persist({ ...input, ...stored });
  }, async archiveRuntimeFile(input: { absolutePath: string; sharedRoots: string[]; conversationId: string; messageId: string; ownerOperatorId?: string }): Promise<Asset | undefined> {
    const requestedPath = path.resolve(input.absolutePath);
    const sharedRoot = input.sharedRoots.find((root) => requestedPath === root || requestedPath.startsWith(`${root}${path.sep}`));
    if (!sharedRoot) return undefined;
    const realRoot = await fs.realpath(sharedRoot); const realPath = await fs.realpath(requestedPath);
    if (realPath !== realRoot && !realPath.startsWith(`${realRoot}${path.sep}`)) return undefined;
    const name = path.basename(realPath); const mimeType = mimeByExtension[path.extname(name).toLowerCase()];
    if (!mimeType) return undefined;
    const stat = await fs.stat(realPath); const maxBytes = validate(mimeType, stat.size); await ensureStorageDirectories(dataDir);
    const stream = Readable.toWeb(createReadStream(realPath)) as ReadableStream<Uint8Array>; const stored = await writeControlledStream({ dataDir, area: "artifacts", stream, extension: path.extname(name).slice(1), maxBytes });
    return persist({ originalName: name, mimeType, ...stored, conversationId: input.conversationId, messageId: input.messageId, ownerOperatorId: input.ownerOperatorId, source: "runtime" });
  }, resolvePath(asset: Asset) { return assertPathInsideRoot(dataDir, path.join(dataDir, asset.relativePath)); } };
}
