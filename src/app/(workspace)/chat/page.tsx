import { ChatWorkspace } from "@/modules/conversations/chat-workspace";
import { config } from "@/infrastructure/config/env";

export default function ChatPage() { return <ChatWorkspace contentWorkspaceEnabled={config.contentWorkspaceEnabled} />; }
