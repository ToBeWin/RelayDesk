import type { Locale } from "@/shared/i18n/locale-provider";

const messages = {
  en: {
    chat: "Chats", contents: "Content", schedule: "Schedule", accounts: "Accounts", members: "Members", settings: "Settings",
    newConversation: "New conversation", collapse: "Collapse sidebar", expand: "Expand sidebar", logout: "Sign out", administrator: "Administrator", member: "Member",
    loginTitle: "Enter your workspace", loginDescription: "Use your authorized member account to collaborate with Hermes Agent.", memberName: "Member name", memberNamePlaceholder: "For example: Alex", password: "Password", passwordPlaceholder: "Enter your password", signIn: "Enter RelayDesk", verifying: "Verifying", loginFailed: "Sign-in failed. Please try again.", internalOnly: "For authorized internal members only", firstUse: "On first use, the workspace password creates the first administrator.",
    loginKicker: "TEAM AI WORKSPACE", loginHero: "Turn every Agent conversation into organized team work", loginHeroDescription: "RelayDesk connects team members with Hermes Agent and preserves conversations, files, and work outcomes as reusable team assets.",
    connected: "Connected", agentConversation: "Conversation with Hermes Agent", previewUserInitial: "A", previewUserMessage: "Please summarize the key decisions and follow-up actions from this product review.", previewTime: "09:41", previewAgentIntro: "Here is a structured summary:", previewPointOne: "Confirm the core scope and priorities", previewPointTwo: "Deliver the technical plan in stages", previewPointThree: "Add data-access validation", previewFollowUp: "Follow-up actions", previewActionOne: "Complete the PRD and flow diagrams", previewActionTwo: "Assess the API migration impact", previewComposer: "Message Hermes Agent…", agentHealthy: "Healthy and ready", viewAgentStatus: "View Agent status", archivedWork: "Archived work", archiveFileName: "Product review notes.md", archiveLocation: "Team knowledge base / Project Alpha", archiveBy: "Archived by Alex on 2026-07-11", archiveDescription: "Includes decisions, action items, and related discussion history.", viewDetails: "View details", internalWorkspace: "Internal team workspace",
    searchChats: "Search chats", searchArchivedChats: "Search archived chats", viewArchive: "View archive", returnToCurrent: "Current chats", archive: "Archive", restore: "Restore", rename: "Rename", sync: "Sync", syncing: "Syncing", delete: "Delete", pin: "Pin", unpin: "Unpin", currentChat: "Current chat", archivedChat: "Archived chat", createFirstChat: "Create your first chat", noAuthorizedAgent: "No authorized Agent", messagePlaceholder: "Describe what you want to create, review, or change…", sendMessage: "Send message", addAttachment: "Add attachment", stopRun: "Stop run",
    close: "Close", cancel: "Cancel", save: "Save", name: "Name", systemNotifications: "System notifications", closeNotification: "Dismiss notification",
  },
  "zh-CN": {
    chat: "对话历史", contents: "内容中心", schedule: "内容排期", accounts: "账号管理", members: "成员授权", settings: "系统设置",
    newConversation: "新建会话", collapse: "折叠侧边栏", expand: "展开侧边栏", logout: "退出登录", administrator: "管理员", member: "成员",
    loginTitle: "进入工作台", loginDescription: "使用已授权的成员账号，开始与 Hermes Agent 协作。", memberName: "成员姓名", memberNamePlaceholder: "例如：王敏", password: "个人密码", passwordPlaceholder: "输入个人密码", signIn: "进入 RelayDesk", verifying: "正在验证", loginFailed: "登录失败，请重试", internalOnly: "仅限公司内网成员使用", firstUse: "首次使用时，工作区密码将创建首位管理员。",
    loginKicker: "团队 AI 工作台", loginHero: "让每一次 Agent 对话，都成为团队的有序工作", loginHeroDescription: "RelayDesk 连接团队成员与 Hermes Agent，将对话、文件与工作成果沉淀为可追溯、可复用的团队资产。",
    connected: "已连接", agentConversation: "与 Hermes Agent 的对话", previewUserInitial: "王", previewUserMessage: "请帮我整理本次需求评审的关键结论和后续行动项。", previewTime: "09:41", previewAgentIntro: "好的，以下是为你整理的要点：", previewPointOne: "确认核心需求范围与优先级", previewPointTwo: "技术方案采用分阶段交付策略", previewPointThree: "新增数据权限校验机制", previewFollowUp: "后续行动项", previewActionOne: "完善 PRD 与流程图", previewActionTwo: "评估接口改造影响", previewComposer: "向 Hermes Agent 发送消息…", agentHealthy: "响应正常，运行良好", viewAgentStatus: "查看 Agent 状态", archivedWork: "归档成果", archiveFileName: "需求评审会议纪要.md", archiveLocation: "团队知识库 / 项目 Alpha", archiveBy: "由 李明 归档于 2026-07-11", archiveDescription: "包含会议结论、行动项与相关讨论记录。", viewDetails: "查看详情", internalWorkspace: "内部团队工作台",
    searchChats: "搜索会话", searchArchivedChats: "搜索归档会话", viewArchive: "查看归档", returnToCurrent: "返回当前会话", archive: "归档", restore: "恢复", rename: "重命名", sync: "同步", syncing: "正在同步", delete: "删除", pin: "置顶", unpin: "取消置顶", currentChat: "当前会话", archivedChat: "已归档会话", createFirstChat: "创建第一个会话", noAuthorizedAgent: "暂无 Agent 授权", messagePlaceholder: "描述你要创作、检查或修改的内容…", sendMessage: "发送消息", addAttachment: "添加附件", stopRun: "停止运行",
    close: "关闭", cancel: "取消", save: "保存", name: "名称", systemNotifications: "系统通知", closeNotification: "关闭通知",
  },
} as const;

export type MessageKey = keyof typeof messages.en;

export function t(locale: Locale, key: MessageKey) {
  return messages[locale][key];
}
