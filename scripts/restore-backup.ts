import path from "node:path";
import { restoreBackup } from "../src/infrastructure/backup/service";

const backupDirectory = process.argv[2];
const dataDirectory = process.argv[3] ?? process.env.RELAYDESK_DATA_DIR ?? "./data";
if (!backupDirectory) throw new Error("Usage: pnpm restore <backup-directory> [data-directory]");
await restoreBackup(path.resolve(backupDirectory), path.resolve(dataDirectory));
process.stdout.write(`RelayDesk backup restored to ${path.resolve(dataDirectory)}\n`);
