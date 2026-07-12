import { createHash, randomUUID } from "node:crypto";
import { createWriteStream, promises as fs } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";

const storageDirectories = ["uploads", "artifacts", "thumbnails", "tmp", "backups"] as const;

export function assertPathInsideRoot(root: string, candidate: string): string {
  // Paths originate from validated server configuration and must stay runtime-resolved.
  const resolvedRoot = path.resolve(/* turbopackIgnore: true */ root);
  const resolvedCandidate = path.resolve(/* turbopackIgnore: true */ candidate);
  if (resolvedCandidate !== resolvedRoot && !resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Path is outside managed storage");
  }
  return resolvedCandidate;
}

export function sha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function createStoredName(extension = ""): string {
  const normalized = extension.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  return `${randomUUID()}${normalized ? `.${normalized}` : ""}`;
}

export async function ensureStorageDirectories(dataDir: string): Promise<void> {
  await Promise.all([dataDir, ...storageDirectories.map((directory) => path.join(/* turbopackIgnore: true */ dataDir, directory))].map((directory) => fs.mkdir(directory, { recursive: true })));
}

export async function writeControlledFile(input: { dataDir: string; area: "uploads" | "artifacts"; content: Buffer; extension?: string }): Promise<{ relativePath: string; storedName: string; sha256: string }> {
  const storedName = createStoredName(input.extension);
  const now = new Date();
  const relativePath = path.join(input.area, String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, "0"), storedName);
  const destination = assertPathInsideRoot(input.dataDir, path.join(/* turbopackIgnore: true */ input.dataDir, relativePath));
  const temporary = assertPathInsideRoot(input.dataDir, path.join(/* turbopackIgnore: true */ input.dataDir, "tmp", `${storedName}.part`));
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(temporary, input.content);
  await fs.rename(temporary, destination);
  return { relativePath, storedName, sha256: sha256(input.content) };
}

export async function writeControlledStream(input: { dataDir: string; area: "uploads" | "artifacts"; stream: ReadableStream<Uint8Array>; extension?: string; maxBytes: number }): Promise<{ relativePath: string; storedName: string; sha256: string; sizeBytes: number }> {
  const storedName = createStoredName(input.extension); const now = new Date();
  const relativePath = path.join(input.area, String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, "0"), storedName);
  const destination = assertPathInsideRoot(input.dataDir, path.join(/* turbopackIgnore: true */ input.dataDir, relativePath));
  const temporary = assertPathInsideRoot(input.dataDir, path.join(/* turbopackIgnore: true */ input.dataDir, "tmp", `${storedName}.part`));
  const hash = createHash("sha256"); let sizeBytes = 0;
  await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.mkdir(path.dirname(temporary), { recursive: true });
  const meter = new Transform({ transform(chunk: Buffer, _encoding, callback) { sizeBytes += chunk.byteLength; if (sizeBytes > input.maxBytes) return callback(new Error("File exceeds configured size limit")); hash.update(chunk); callback(null, chunk); } });
  try {
    await pipeline(Readable.fromWeb(input.stream as never), meter, createWriteStream(temporary, { flags: "wx" }));
    await fs.rename(temporary, destination);
    return { relativePath, storedName, sha256: hash.digest("hex"), sizeBytes };
  } catch (error) { await fs.rm(temporary, { force: true }).catch(() => undefined); throw error; }
}
