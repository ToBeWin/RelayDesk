import { NextResponse } from "next/server";
import { createDatabase } from "@/infrastructure/db/client";
import { config } from "@/infrastructure/config/env";
import { getCurrentOperatorId } from "@/modules/auth/current-operator";
import { createAssetService } from "@/modules/assets/service";
import { createContentService } from "@/modules/contents/service";
import { createConversationService } from "@/modules/conversations/service";
import { getRuntimeConnectorForConnection } from "@/runtime/registry";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const operatorId = await getCurrentOperatorId();
  if (!operatorId) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const encodedName = request.headers.get("x-relaydesk-file-name");
  const mimeType = request.headers.get("content-type")?.split(";", 1)[0] ?? "";
  const declaredSize = Number(request.headers.get("content-length"));
  const contentRecordId = request.headers.get("x-relaydesk-content-id") ?? undefined;
  if (!encodedName || !request.body || !Number.isSafeInteger(declaredSize) || declaredSize < 1) {
    return NextResponse.json({ message: "文件信息不完整" }, { status: 400 });
  }

  let originalName: string;
  try { originalName = decodeURIComponent(encodedName); } catch { return NextResponse.json({ message: "文件名不正确" }, { status: 400 }); }
  if (!originalName.trim() || originalName.length > 255) return NextResponse.json({ message: "文件名不正确" }, { status: 400 });

  const { sqlite } = createDatabase();
  try {
    if (contentRecordId) {
      const content = createContentService(sqlite).get(contentRecordId);
      if (!content) return NextResponse.json({ message: "关联内容不存在" }, { status: 400 });
      const conversations = createConversationService(sqlite, (id) => getRuntimeConnectorForConnection(sqlite, id));
      if (!conversations.get(content.conversationId, operatorId)) return NextResponse.json({ message: "无权向该内容上传文件" }, { status: 403 });
    }
    const asset = await createAssetService(sqlite, config.dataDir).archiveUploadStream({
      originalName,
      mimeType,
      sizeBytes: declaredSize,
      stream: request.body,
      contentRecordId,
      ownerOperatorId: operatorId,
    });
    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "文件归档失败" }, { status: 400 });
  } finally { sqlite.close(); }
}
