import { createHash, randomUUID } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { assertPathInsideRoot } from "@/infrastructure/storage/files";

type ManifestEntry = { path: string; sizeBytes: number; sha256: string };
type BackupManifest = { createdAt: string; version: 1; files: ManifestEntry[] };
export type BackupResult = { directory: string; manifest: BackupManifest };
const managedItems = ["relaydesk.db", "uploads", "artifacts", "thumbnails"] as const;

async function hashFile(file: string): Promise<{ sizeBytes: number; sha256: string }> {
  const hash = createHash("sha256"); let sizeBytes = 0;
  for await (const chunk of createReadStream(file)) { const bytes = chunk as Buffer; sizeBytes += bytes.byteLength; hash.update(bytes); }
  return { sizeBytes, sha256: hash.digest("hex") };
}

async function collectFiles(root: string, directory: string): Promise<ManifestEntry[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true }); const files: ManifestEntry[] = [];
  for (const entry of entries) {
    const absolute = path.join(/* turbopackIgnore: true */ directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(root, absolute));
    else files.push({ path: path.relative(root, absolute).split(path.sep).join("/"), ...await hashFile(absolute) });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function createBackup(dataDir: string): Promise<BackupResult> {
  const backups = path.join(/* turbopackIgnore: true */ dataDir, "backups"); const stamp = new Date().toISOString().replace(/[:.]/g, "-"); const temporary = path.join(/* turbopackIgnore: true */ backups, `.tmp-${randomUUID()}`); const destination = path.join(/* turbopackIgnore: true */ backups, `relaydesk-${stamp}`); await fs.mkdir(temporary, { recursive: true });
  try {
    const sourceDatabase = path.join(/* turbopackIgnore: true */ dataDir, "relaydesk.db");
    try { const database = new Database(sourceDatabase, { readonly: true, fileMustExist: true }); try { await database.backup(path.join(/* turbopackIgnore: true */ temporary, "relaydesk.db")); } finally { database.close(); } } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    for (const item of managedItems.slice(1)) { const source = path.join(/* turbopackIgnore: true */ dataDir, item); try { await fs.cp(source, path.join(/* turbopackIgnore: true */ temporary, item), { recursive: true, force: true }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
    const manifest = { createdAt: new Date().toISOString(), version: 1 as const, files: await collectFiles(temporary, temporary) }; await fs.writeFile(path.join(/* turbopackIgnore: true */ temporary, "manifest.json"), JSON.stringify(manifest, null, 2)); await fs.rename(temporary, destination); return { directory: destination, manifest };
  } catch (error) { await fs.rm(temporary, { recursive: true, force: true }); throw error; }
}

export async function verifyBackup(backupDirectory: string): Promise<BackupManifest> {
  const root = path.resolve(backupDirectory); const raw = await fs.readFile(path.join(/* turbopackIgnore: true */ root, "manifest.json"), "utf8"); const manifest = JSON.parse(raw) as BackupManifest;
  if (manifest.version !== 1 || !Array.isArray(manifest.files)) throw new Error("Unsupported backup manifest");
  for (const entry of manifest.files) {
    if (!entry.path || !Number.isSafeInteger(entry.sizeBytes) || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error("Invalid backup manifest entry");
    const file = assertPathInsideRoot(root, path.join(/* turbopackIgnore: true */ root, entry.path)); const actual = await hashFile(file);
    if (actual.sizeBytes !== entry.sizeBytes || actual.sha256 !== entry.sha256) throw new Error(`Backup checksum mismatch: ${entry.path}`);
  }
  return manifest;
}

export async function restoreBackup(backupDirectory: string, dataDir: string): Promise<void> {
  const manifest = await verifyBackup(backupDirectory); const parent = path.dirname(path.resolve(dataDir)); const token = randomUUID(); const stage = path.join(/* turbopackIgnore: true */ parent, `.relaydesk-restore-${token}`); const rollback = path.join(/* turbopackIgnore: true */ parent, `.relaydesk-rollback-${token}`);
  await Promise.all([stage, rollback, ...managedItems.slice(1).map((item) => path.join(/* turbopackIgnore: true */ stage, item))].map((directory) => fs.mkdir(directory, { recursive: true })));
  try {
    for (const entry of manifest.files) { const source = assertPathInsideRoot(backupDirectory, path.join(/* turbopackIgnore: true */ backupDirectory, entry.path)); const destination = assertPathInsideRoot(stage, path.join(/* turbopackIgnore: true */ stage, entry.path)); await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.copyFile(source, destination); }
    for (const item of managedItems) { const current = path.join(/* turbopackIgnore: true */ dataDir, item); const previous = path.join(/* turbopackIgnore: true */ rollback, item); try { await fs.rename(current, previous); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
    try { for (const item of managedItems) { const restored = path.join(/* turbopackIgnore: true */ stage, item); try { await fs.rename(restored, path.join(/* turbopackIgnore: true */ dataDir, item)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } } }
    catch (error) { for (const item of managedItems) { await fs.rm(path.join(/* turbopackIgnore: true */ dataDir, item), { recursive: true, force: true }); const previous = path.join(/* turbopackIgnore: true */ rollback, item); try { await fs.rename(previous, path.join(/* turbopackIgnore: true */ dataDir, item)); } catch { /* Preserve rollback directory for manual recovery. */ } } throw error; }
  } finally { await fs.rm(stage, { recursive: true, force: true }); await fs.rm(rollback, { recursive: true, force: true }); }
}
