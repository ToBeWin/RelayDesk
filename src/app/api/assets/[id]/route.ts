import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { config } from "@/infrastructure/config/env";
import { createDatabase } from "@/infrastructure/db/client";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createAssetService } from "@/modules/assets/service";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const operatorId = await getCurrentOperatorId();
  if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const { sqlite } = createDatabase();
  try {
    const service = createAssetService(sqlite, config.dataDir);
    const asset = service.getViewAuthorized((await context.params).id, operatorId);
    if (!asset) return NextResponse.json({ message: "资产不存在" }, { status: 404 });
    try {
      const file = service.resolvePath(asset); await fs.access(file);
      const range = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
      const start = range?.[1] ? Number(range[1]) : 0;
      const end = range?.[2] ? Math.min(Number(range[2]), asset.sizeBytes - 1) : asset.sizeBytes - 1;
      if (range && (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= asset.sizeBytes)) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${asset.sizeBytes}` } });
      const content = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream<Uint8Array>;
      return new Response(content, { status: range ? 206 : 200, headers: { "Content-Type": asset.mimeType, "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes", ...(range ? { "Content-Range": `bytes ${start}-${end}/${asset.sizeBytes}` } : {}), "X-Content-Type-Options": "nosniff", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(asset.originalName ?? "asset")}` } });
    } catch { return NextResponse.json({ message: "资产文件不可用" }, { status: 404 }); }
  } finally { sqlite.close(); }
}
