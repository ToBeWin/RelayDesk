# RelayDesk — AGENTS.md

> 本文件适用于整个 RelayDesk 仓库，是 Codex、Claude Code、Cursor Agent 及其他编码代理的首要项目说明。
> 除非用户明确修改需求，否则所有实现、重构、测试和文档工作都必须遵守本文件。

## 0. 工作原则

1. 先理解现有代码，再修改；不要在未检查仓库结构、配置和已有实现时大规模重写。
2. 优先交付最小但完整、稳定、可维护的闭环，不为了“未来可能需要”引入复杂基础设施。
3. 本项目是 **Agent Runtime 的增强型 Web Channel**，不是新的 Agent Runtime，也不是独立模型平台。
4. Hermes/OpenClaw 负责推理、LLM、图片生成、工具、Skills、Memory、Agent Loop；Web 只负责消息通信、同步、持久化、展示和轻量管理。
5. 所有外部 Runtime 交互必须通过 Connector 层；页面、业务模块、数据库层不得直接依赖 Hermes 的具体协议。
6. 所有完整消息必须同步到 SQLite；所有上传文件、生成图片和其他产物必须复制或保存到服务器受控目录。
7. 不直接调用 OpenAI、Anthropic、Gemini、图片模型或其他模型供应商 API；这些能力全部属于底层 Runtime。
8. 不引入微服务、Redis、消息队列、PostgreSQL、向量数据库、对象存储或 Kubernetes，除非用户明确要求升级架构。
9. 不牺牲数据安全换取开发速度。消息、文件、排期和内容元数据必须在进程重启后完整保留。
10. 遇到 Hermes 接口不明确时，不猜测接口。先检查已有源码、接口文档、运行实例或环境变量；将协议差异限制在 `HermesConnector` 内。
11. 例行工程决策自行采用本文给出的默认方案，不因小问题反复请求确认。
12. 每完成一个阶段，运行类型检查、Lint 和相关测试；不要积累大量未验证代码。

---

## 1. 产品定义

### 1.1 产品定位

本项目正式名称为 **RelayDesk**。产品品牌名、仓库名和默认界面名称统一使用 `RelayDesk`；客户工作区名称、Logo 和主题可以配置，但不得在代码中把某个客户名称写死。

它是一个部署在工作室内网的团队 Web 工作台，把原本通过钉钉、Telegram、终端或其他 Channel 与 Hermes/OpenClaw 沟通的过程，迁移到浏览器，并增加：

- 多内容账号管理；
- 完整会话和消息历史；
- 图片、文件及 Agent 产物本地归档；
- 内容预览与“保存为内容”；
- 内容自检快捷操作；
- 封面生成、再次生成、重新上传图片；
- 简单内容状态和发布排期；
- 团队成员通过局域网共同访问；
- 即使 Agent 压缩上下文，Web 中的历史资产仍然完整可查。

一句话定义：

> 把 Agent 对话变成可搜索、可预览、可管理、可排期的团队内容工作台。

英文定位：

> **A self-hosted web channel and collaborative workspace for AI agent runtimes.**

产品标语：

> **Turn agent conversations into organized work.**
> **让 Agent 的每一次对话，都成为可管理的工作成果。**

### 1.1.1 命名约定

所有新增代码、配置、文档和部署文件必须遵守以下命名：

- 产品名称：`RelayDesk`
- 仓库名称：`relaydesk`
- npm package 名称：`relaydesk`
- Docker service / image：`relaydesk`
- 默认持久化卷：`relaydesk-data`
- 默认数据库文件：`relaydesk.db`
- 环境变量前缀：`RELAYDESK_`
- 页面标题：`RelayDesk`
- 首个 Runtime Connector：`HermesConnector`
- 后续 Runtime Connector：`OpenClawConnector`

`workspace` 仍可作为通用领域概念、路由分组或客户工作区实体名称使用；不得把通用 `workspace` 概念机械替换为品牌名。

### 1.2 核心边界

```text
浏览器
  │
  ▼
RelayDesk Web
  ├── 登录与成员标识
  ├── 会话、消息和附件同步
  ├── 内容记录、账号、排期
  ├── 历史搜索和预览
  └── 本地 SQLite / 文件目录
  │
  ▼
Runtime Connector
  ├── HermesConnector      # V1 实现
  └── OpenClawConnector    # 未来实现
  │
  ▼
Hermes / OpenClaw Agent Runtime
  ├── LLM
  ├── 图片生成
  ├── Tools / MCP
  ├── Skills
  ├── Memory
  └── Agent Loop
```

### 1.3 Web 负责

- 登录、局域网访问和操作者标识；
- 向 Runtime 发送文本、图片和文件；
- 接收并显示流式文本、工具事件、图片、文件、错误和任务状态；
- 完整同步会话和消息到 SQLite；
- 保存上传文件和 Agent 生成产物到服务器目录；
- 会话搜索、归档、继续对话；
- 将某条 Agent 回复保存为内容记录；
- 内容 Markdown 预览、人工编辑备注、状态、排期；
- “内容自检”“生成封面”“再生成一张”等快捷操作，本质上仍是向 Runtime 发送标准消息；
- 备份数据库和文件；
- 提供健康状态和清晰错误提示。

### 1.4 Web 不负责

- 不实现 LLM Provider；
- 不实现图片生成 Provider；
- 不实现 Agent Loop；
- 不实现 Memory、Skills、MCP 或工具执行；
- 不重新实现 Hermes/OpenClaw 的模型配置；
- 不尝试替代 Agent 的上下文压缩；
- 不直接自动发布到抖音、视频号、小红书等平台；
- 不做复杂 CMS、审批流、在线 Photoshop、视频剪辑或 SaaS 计费；
- 不与钉钉双向同步；本项目本身就是一个新的 Web Channel。

---

## 2. V1 目标与范围

V1 面向人数不多的工作室，部署在与 Hermes 同一内网环境。目标是快速上线、稳定、省心、低维护。

### 2.1 V1 必须实现

1. 共享工作区密码登录；登录后填写或选择操作者姓名。
2. 多个“内容账号”，按编号和名称管理，例如 `01号账号`、`02号账号`。
3. Hermes 连接状态检测、Profile 选择（若 Runtime 支持）。
4. 新建会话、会话列表、搜索、重命名、归档、继续会话。
5. 文本发送和流式回复。
6. 图片和文件上传，并随消息发送给 Hermes。
7. Tool/运行状态的基础展示；未知事件必须保留原始数据并可降级显示。
8. 所有完整消息同步到 SQLite，页面刷新和服务重启后仍可查看。
9. 用户上传文件与 Hermes 返回的图片、文件复制到服务器受控目录。
10. 消息上的“保存为内容”操作。
11. 内容库：账号、标题、状态、来源会话、封面、排期、备注、搜索。
12. “内容自检”快捷操作：把当前内容及必要上下文发送给 Hermes，保存自检结果。
13. 封面工作流：上传图片、请求 Hermes 生成封面、再次生成、重新上传图片后生成、选择最终封面。
14. 简单排期列表；可设置计划日期和状态，不自动发布。
15. 数据和文件备份脚本，提供操作文档。
16. Docker Compose 或单命令启动，允许局域网访问。
17. 中文界面，桌面端优先，常用操作有明确 Loading、成功和错误反馈。

### 2.2 V1 暂不实现

- 多租户；
- 会员和在线支付；
- 细粒度 RBAC；
- 企业 SSO；
- 自动发布到内容平台；
- 复杂日历拖拽；
- 在线图片编辑器；
- 视频生成和剪辑；
- 独立模型 API 配置；
- OpenClaw 的正式连接实现；
- 多机高可用；
- Redis、队列、对象存储；
- 向量检索和 RAG 平台。

---

## 3. 默认技术栈

除非仓库已有成熟技术栈，不要无理由替换。

### 3.1 推荐栈

- **Next.js App Router + TypeScript（strict）**
- **React**
- **Tailwind CSS + shadcn/ui**
- **Drizzle ORM + better-sqlite3**
- **Zod**：输入、配置和 Runtime 数据校验
- **SSE 或 Fetch ReadableStream**：流式消息
- **react-markdown + rehype-sanitize**：安全 Markdown 渲染
- **Vitest**：单元与集成测试
- **Playwright**：核心 E2E
- **pnpm**：包管理
- **Docker / Docker Compose**：部署

### 3.2 不要引入

- Redux：优先服务端状态、URL 状态、React Query 或局部状态；
- 大型工作流引擎；
- GraphQL；
- 微服务；
- 独立 API 网关；
- Redis；
- 数据仓库或搜索引擎；
- 未被实际使用的抽象层和设计模式。

### 3.3 Node Runtime

所有涉及 SQLite、文件系统、Runtime 代理和流式连接的 Route Handler 必须使用 Node Runtime，不得部署到 Edge Runtime。

---

## 4. 推荐目录结构

若仓库为空，按以下结构初始化；若已有结构，保持等价边界即可，不必机械重命名。

```text
src/
├── app/
│   ├── (auth)/login/
│   ├── (workspace)/
│   │   ├── chat/
│   │   ├── contents/
│   │   ├── schedule/
│   │   ├── accounts/
│   │   └── settings/
│   └── api/
│       ├── auth/
│       ├── runtime/
│       ├── conversations/
│       ├── messages/
│       ├── uploads/
│       ├── contents/
│       ├── reviews/
│       ├── schedules/
│       └── backups/
├── modules/
│   ├── auth/
│   ├── accounts/
│   ├── conversations/
│   ├── messages/
│   ├── assets/
│   ├── contents/
│   ├── schedules/
│   └── settings/
├── runtime/
│   ├── contracts/
│   ├── hermes/
│   ├── mock/
│   └── registry.ts
├── infrastructure/
│   ├── db/
│   ├── storage/
│   ├── backup/
│   ├── logging/
│   └── config/
├── shared/
│   ├── components/
│   ├── errors/
│   ├── hooks/
│   ├── types/
│   └── utils/
└── tests/

data/
├── relaydesk.db
├── uploads/
├── artifacts/
├── thumbnails/
├── tmp/
└── backups/

docs/
├── architecture.md
├── hermes-integration.md
├── deployment.md
└── backup-restore.md
```

### 4.1 模块边界

- 页面组件不得直接访问数据库。
- 页面组件不得直接调用 Hermes。
- Route Handler 只负责协议适配、鉴权、校验和调用 Application Service，不堆积业务逻辑。
- Repository 不返回 ORM 特有对象到 UI 层。
- Connector 不直接修改内容、排期等业务数据。
- 外部 Runtime 原始数据必须先映射为内部类型。

---

## 5. Runtime Connector 设计

V1 只正式实现 Hermes，但数据库、接口和 UI 不得把 `hermes` 写死在核心模型中。

### 5.1 Connector 合约

```ts
export type RuntimeType = "hermes" | "openclaw" | "mock";

export interface RuntimeCapabilities {
  streaming: boolean;
  sessions: boolean;
  profiles: boolean;
  attachments: boolean;
  toolEvents: boolean;
  cancellation: boolean;
  compression: boolean;
  generatedAssets: boolean;
}

export interface RuntimeConnector {
  readonly type: RuntimeType;

  getInfo(): Promise<RuntimeInfo>;
  healthCheck(): Promise<RuntimeHealth>;
  getCapabilities(): Promise<RuntimeCapabilities>;

  listProfiles(): Promise<RuntimeProfile[]>;
  listSessions(input?: ListSessionsInput): Promise<RuntimeSessionSummary[]>;
  getSession(externalSessionId: string): Promise<RuntimeSession>;
  createSession(input: CreateSessionInput): Promise<RuntimeSessionSummary>;

  sendMessage(input: SendMessageInput): AsyncIterable<ChannelEvent>;
  cancelRun?(externalRunId: string): Promise<void>;
  compressSession?(externalSessionId: string, focus?: string): Promise<void>;
  renameSession?(externalSessionId: string, title: string): Promise<void>;
  archiveSession?(externalSessionId: string): Promise<void>;
}
```

### 5.2 统一事件模型

```ts
export type ChannelEvent =
  | { type: "run.started"; runId: string; sessionId: string; raw?: unknown }
  | { type: "message.started"; messageId: string; role: "assistant"; raw?: unknown }
  | { type: "message.delta"; messageId: string; text: string; raw?: unknown }
  | { type: "message.completed"; message: ChannelMessage; raw?: unknown }
  | { type: "tool.started"; toolCall: ChannelToolCall; raw?: unknown }
  | { type: "tool.updated"; toolCall: ChannelToolCall; raw?: unknown }
  | { type: "tool.completed"; toolCall: ChannelToolCall; raw?: unknown }
  | { type: "asset.created"; asset: RuntimeAsset; raw?: unknown }
  | { type: "approval.required"; approval: ApprovalRequest; raw?: unknown }
  | { type: "context.updated"; usage: ContextUsage; raw?: unknown }
  | { type: "run.completed"; runId: string; raw?: unknown }
  | { type: "run.failed"; runId?: string; error: ChannelError; raw?: unknown };
```

### 5.3 Hermes 集成规则

1. 优先通过 Hermes 已提供的 HTTP/SSE/Gateway/WebUI 接口连接。
2. 不在 Web 项目中导入 Hermes 的 Python 内部模块。
3. 所有 Hermes URL、鉴权、Profile 和协议配置只存在于服务端。
4. Hermes 原始事件只在 `src/runtime/hermes/` 中解析。
5. 任何无法识别的事件都要记录 `raw` 数据，不得静默丢弃。
6. 在 `docs/hermes-integration.md` 记录实际使用的端点、请求、事件和版本兼容信息。
7. 如果真实 Hermes 接口尚不可用，先实现确定性的 `MockConnector` 完成 UI、同步和测试；不得凭空编造生产端点。
8. Connector 错误必须转换为统一错误码，例如：
   - `RUNTIME_UNAVAILABLE`
   - `RUNTIME_AUTH_FAILED`
   - `SESSION_NOT_FOUND`
   - `RUN_TIMEOUT`
   - `ATTACHMENT_REJECTED`
   - `STREAM_INTERRUPTED`
   - `UNKNOWN_RUNTIME_ERROR`

### 5.4 能力降级

UI 必须根据 `RuntimeCapabilities` 显示或隐藏功能。禁止散落大量：

```ts
if (runtimeType === "hermes") { ... }
```

只有 Connector 注册和设置页可以明确识别具体 Runtime 类型。

---

## 6. 数据所有权与同步原则

### 6.1 权威来源

- Runtime 是 Agent 执行、上下文、工具、Memory 和外部会话状态的权威来源。
- Web 的 SQLite 是完整消息镜像、搜索历史、内容记录、账号、排期、用户备注和文件索引的权威来源。
- Web 不依赖 Runtime Memory 才能恢复业务资料。
- Runtime 中缺少某条历史时，不得自动删除 Web 本地历史；只标记同步状态。

### 6.2 出站消息流程

1. 校验登录、会话、文本和附件。
2. 在 SQLite 中创建用户消息，状态为 `pending`。
3. 为本次调用创建 `run`，状态为 `pending`。
4. 调用 Connector。
5. Runtime 接受后，保存 `external_message_id`、`external_run_id`，消息改为 `sent`，run 改为 `running`。
6. 创建 assistant 消息，状态为 `streaming`。
7. 接收流式事件并更新 UI。
8. 文本增量在内存中拼接；最多每 500–1000ms 批量写一次 SQLite，不得每 Token 写库。
9. 收到完成事件后，事务性写入最终消息、原始 JSON、工具事件、资产索引和 run 状态。
10. 失败时保留已接收内容，状态改为 `failed` 或 `interrupted`，允许重试或继续同步。

### 6.3 入站与重连同步

- 页面打开、切换会话、流中断或手动同步时，从 Runtime 拉取最新会话。
- 通过以下组合唯一去重：

```text
runtime_connection_id + external_session_id + external_message_id
```

- 若外部消息没有稳定 ID，只允许在 Connector 内使用内容哈希作为兼容手段，并记录警告。
- Upsert 必须幂等；重复同步不得生成重复消息或重复文件。
- 同步完成后更新 `sync_cursor`、`last_synced_at` 和 `sync_status`。

### 6.4 消息完整性

Web 必须保存：

- 完整文本；
- 角色；
- 消息顺序；
- 发送/创建时间；
- 状态；
- Runtime 外部 ID；
- 原始消息 JSON；
- 与消息关联的图片、文件和工具事件；
- 发起操作的操作者姓名；
- 任务类型，例如 `chat`、`self_check`、`cover_generate`、`cover_regenerate`。

---

## 7. SQLite 数据模型

使用 Drizzle migration。所有表必须包含可追踪的 `created_at`，需要修改的实体还要有 `updated_at`。

### 7.1 `operators`

用于记录谁进行了操作。V1 使用共享密码，不做复杂权限。

```text
id                 text primary key
name               text not null unique
active             integer not null default 1
created_at         integer not null
updated_at         integer not null
```

### 7.2 `content_accounts`

客户运营的内容账号，不是 Web 登录账号。

```text
id                         text primary key
code                       text not null unique
name                       text not null
description                text
notes                      text
default_runtime_connection_id text
default_profile_id         text
enabled                    integer not null default 1
created_at                 integer not null
updated_at                 integer not null
```

### 7.3 `runtime_connections`

```text
id                 text primary key
type               text not null                 # hermes/openclaw/mock
name               text not null
base_url           text not null
profile_id         text
config_json        text not null default '{}'
enabled            integer not null default 1
created_at         integer not null
updated_at         integer not null
```

敏感凭据不得明文返回前端。V1 优先由环境变量提供凭据；若必须存库，使用服务端密钥加密。

### 7.4 `conversations`

```text
id                         text primary key
runtime_connection_id      text not null
content_account_id         text
external_session_id        text not null
title                      text not null
status                     text not null default 'active'
profile_id                 text
sync_cursor                text
sync_status                text not null default 'idle'
last_synced_at             integer
last_message_at            integer
created_by_operator_id     text
created_at                 integer not null
updated_at                 integer not null
```

唯一约束：

```text
(runtime_connection_id, external_session_id)
```

### 7.5 `messages`

```text
id                         text primary key
conversation_id            text not null
external_message_id        text
local_client_id            text not null
role                       text not null          # user/assistant/system/tool
status                     text not null          # pending/sent/streaming/completed/failed/cancelled/interrupted
message_type               text not null default 'text'
task_kind                  text not null default 'chat'
content_text               text not null default ''
raw_json                   text not null default '{}'
sequence_no                integer not null
operator_id                text
external_created_at        integer
created_at                 integer not null
updated_at                 integer not null
```

唯一约束：

```text
(conversation_id, local_client_id)
```

外部 ID 存在时增加部分唯一索引或应用层幂等约束。

### 7.6 `runs`

```text
id                         text primary key
conversation_id            text not null
request_message_id         text
response_message_id        text
external_run_id            text
status                     text not null
error_code                 text
error_message              text
usage_json                 text not null default '{}'
started_at                 integer
completed_at               integer
created_at                 integer not null
updated_at                 integer not null
```

### 7.7 `run_events`

保存工具、审批、上下文和关键原始事件，便于恢复和调试；不保存每个 token delta。

```text
id                 text primary key
run_id             text not null
sequence_no        integer not null
event_type         text not null
payload_json       text not null
created_at         integer not null
```

### 7.8 `assets`

```text
id                         text primary key
conversation_id            text
message_id                 text
run_id                     text
content_record_id          text
external_asset_id          text
asset_type                 text not null          # image/file/audio/video/document
source                     text not null          # upload/runtime/import
original_name              text
stored_name                text not null
relative_path              text not null
mime_type                  text not null
size_bytes                 integer not null
sha256                     text not null
width                      integer
height                     integer
metadata_json              text not null default '{}'
created_at                 integer not null
```

`sha256` 建索引，用于去重，但同一文件可在不同消息中建立关联记录。

### 7.9 `content_records`

某条 Agent 回复被用户标记为可管理内容后创建。

```text
id                         text primary key
content_account_id         text
conversation_id            text not null
source_message_id          text not null
title                      text not null
body_markdown              text not null
summary                    text
status                     text not null default 'draft'
selected_cover_asset_id    text
notes                      text
created_by_operator_id     text
created_at                 integer not null
updated_at                 integer not null
```

内容状态：

```text
draft / checking / needs_revision / ready / scheduled / published / archived
```

### 7.10 `content_reviews`

```text
id                         text primary key
content_record_id          text not null
request_message_id         text not null
response_message_id        text
score                      integer
result_markdown            text
status                     text not null
created_at                 integer not null
```

### 7.11 `schedule_entries`

```text
id                         text primary key
content_record_id          text not null
scheduled_at               integer not null
status                     text not null default 'planned'
notes                      text
created_by_operator_id     text
created_at                 integer not null
updated_at                 integer not null
```

V1 状态：`planned / completed / cancelled`。

### 7.12 `quick_actions`

快捷操作只是 Web 发送给 Agent 的消息模板，不是模型或工作流引擎。

```text
id                 text primary key
key                text not null unique
name               text not null
prompt_template    text not null
enabled            integer not null default 1
created_at         integer not null
updated_at         integer not null
```

至少内置：

- `content_generate`
- `content_self_check`
- `cover_generate`
- `cover_regenerate`
- `context_resync`

### 7.13 `app_settings`

使用受控 key-value，不保存明文密钥到可返回前端的字段。

```text
key                text primary key
value_json         text not null
updated_at         integer not null
```

---

## 8. 文件存储

### 8.1 目录

```text
data/
├── relaydesk.db
├── uploads/YYYY/MM/
├── artifacts/YYYY/MM/
├── thumbnails/YYYY/MM/
├── tmp/
└── backups/
```

- `uploads/`：用户上传；
- `artifacts/`：Hermes 返回或生成的图片、文档、音频、视频；
- `thumbnails/`：可选缩略图；
- `tmp/`：流式上传和下载临时文件；
- `backups/`：数据库与文件备份包。

### 8.2 文件规则

1. 数据库不保存大文件 BLOB，只保存相对路径和元数据。
2. 服务端生成随机文件名；原始文件名只作为展示元数据。
3. 禁止用户输入任何磁盘路径。
4. 所有路径必须经过 `path.resolve` 和根目录校验，防止目录穿越。
5. 先写入 `tmp`，完成校验后原子 `rename` 到目标目录。
6. 计算 SHA-256；重复内容可以复用实际文件。
7. 大文件使用流，不一次性加载到内存。
8. 校验 MIME、扩展名和大小；默认允许常见图片、PDF、文本、Office 文档、音频和视频，其他类型拒绝或需配置。
9. 默认单文件上限通过环境变量配置，建议 50MB；图片可单独限制为 20MB。
10. 不接受任意 URL 抓取。若必须从 Runtime 下载资产，只允许 `RELAYDESK_RUNTIME_ASSET_ALLOWED_HOSTS` 中的主机。
11. Runtime 若返回本机文件路径，只允许读取配置的 `RELAYDESK_RUNTIME_SHARED_PATHS` 内文件。
12. 对图片生成缩略图时保留原图，失败不影响主流程。

### 8.3 资产归档

Hermes 返回图片或文件时：

1. Connector 解析资产引用；
2. 下载或复制到 `artifacts/`；
3. 校验文件；
4. 计算哈希；
5. 写入 `assets`；
6. 将资产关联到消息和 run；
7. UI 展示本地受控 URL，而不是长期依赖 Runtime 临时 URL。

---

## 9. 核心用户流程

### 9.1 登录与操作者

- V1 使用一个共享工作区密码 `RELAYDESK_PASSWORD`。
- 登录成功后，用户填写或选择操作者姓名。
- 操作者姓名保存在签名 Session Cookie 或服务端 Session 中。
- 每条用户消息、内容修改、排期和删除操作都记录操作者。
- 不做复杂权限；设置和危险操作可要求再次输入工作区密码。

### 9.2 新建和继续会话

1. 用户选择内容账号。
2. 选择 Runtime 连接和 Profile；默认取账号绑定配置。
3. 新建 Runtime Session。
4. 在 SQLite 创建对应 `conversation`。
5. 进入聊天页。
6. 重新进入时，先显示本地消息，再后台增量同步 Runtime。

### 9.3 发送消息

- 支持纯文本、文本加多个附件。
- 发送前将用户消息落库，避免网络失败导致输入丢失。
- 输入区支持停止、重试和再次编辑发送。
- 对正在运行的会话，禁止无提示地创建多个冲突 run；可以排队或要求用户停止当前 run。

### 9.4 保存为内容

每条 assistant 完整回复提供“保存为内容”：

1. 默认标题取第一个 Markdown 一级/二级标题；没有标题则取前 60 个字符。
2. `body_markdown` 保存完整回复，不能只保存摘要。
3. 自动关联当前账号、会话和来源消息。
4. 用户可编辑标题、备注、状态和排期。
5. 关联当前会话中的图片，允许选择最终封面。
6. 点击内容记录可回到原会话继续让 Hermes 修改。

V1 不强制把回复解析成选题、标题、正文、旁白等数据库列。优先完整保存和可靠预览；可通过标准 Markdown 章节增强展示。

### 9.5 内容自检

“内容自检”不是 Web 自己审核，而是向当前 Runtime 发送标准消息。

必须把当前内容正文显式放入请求，不能只依赖会话记忆：

```text
请对以下待发布内容进行发布前自检。

【账号信息】
{{account_context}}

【待检查内容】
{{content_markdown}}

请检查：
1. 是否符合账号定位；
2. 标题、正文、旁白是否一致；
3. 是否有明显事实、逻辑或表达问题；
4. 是否重复、啰嗦、机械化；
5. 是否适合口播；
6. 是否存在敏感、违规或容易误解的表达；
7. 是否遗漏关键信息；
8. 给出修改建议和 0-100 分评分。

请使用清晰 Markdown 输出。
```

流程：

1. 创建 `content_review`，状态 `running`。
2. 发送一条可审计的用户消息，`task_kind=self_check`。
3. 接收 Hermes 回复并完整保存。
4. 将回复关联到 review；能可靠提取评分时保存 `score`，提取失败不影响展示。
5. 内容页显示最新自检结果和历史自检。
6. 用户可点击“让 Hermes 按建议修改”，继续发送消息。

### 9.6 封面生成

Web 不直接调用图片模型。

首次生成：

1. 用户上传参考图片，可选当前内容记录。
2. Web 保存上传文件并作为附件发送给 Hermes。
3. 发送快捷消息，`task_kind=cover_generate`：

```text
请基于当前内容和本次上传的图片生成一张封面。
封面标题：{{cover_title}}
比例：{{aspect_ratio}}
补充要求：{{extra_requirements}}
请调用你已有的图片生成能力，并返回最终图片文件。
```

4. Hermes 调用其 Tool/Skill/图片能力。
5. Web 归档返回图片并展示。
6. 用户选择某张图片作为内容记录的最终封面。

“再生成一张”：

- 在同一会话发送：

```text
保持上一版封面的主题、标题、比例和约束，再生成一个明显不同的方案。
```

- `task_kind=cover_regenerate`。

“重新上传”：

- 保存新附件并发送：

```text
请改用我本次新上传的图片，按照当前封面要求重新生成。
```

### 9.7 上下文丢失处理

Web 不接管 Hermes Memory，但提供轻量恢复：

- 右侧“当前内容”面板显示账号、来源内容、选中封面、状态和排期。
- 提供“同步当前内容到 Hermes”快捷操作。
- 该操作把当前内容正文、账号备注、选中封面说明和排期重新发送给 Hermes。
- 完整历史始终可搜索和重新发送。
- 不把整个历史无脑注入 Runtime，避免上下文再次膨胀。

### 9.8 排期

- V1 是计划管理，不自动发布。
- 用户可为内容设置一个或多个排期记录。
- 提供按日期、账号、状态筛选的列表；简单月历可作为增强，不影响首版验收。
- 排期记录必须能打开对应内容和来源会话。

---

## 10. UI/UX 规范

### 10.1 主布局

聊天工作台采用三栏布局：

```text
左侧：账号 + 会话
中间：消息流 + 输入框
右侧：内容预览 / 文件 / 排期
```

建议尺寸：

- 左栏约 260–300px；
- 右栏约 340–400px，可折叠；
- 中间自适应。

### 10.2 页面

至少包含：

- `/chat`：核心聊天工作台；
- `/contents`：内容库；
- `/schedule`：排期列表；
- `/accounts`：内容账号；
- `/settings`：Runtime、密码提示、数据目录、备份、健康状态。

### 10.3 消息展示

支持：

- Markdown；
- 代码块复制；
- 图片灯箱；
- 文件卡片；
- 工具调用折叠卡片；
- 运行状态；
- 错误重试；
- 消息时间、操作者和同步状态；
- “保存为内容”“内容自检”“继续修改”等操作。

未知 Runtime 结构必须提供安全的 JSON 折叠预览，不能导致页面崩溃。

### 10.4 视觉风格

- 默认品牌名和浏览器标题统一显示 `RelayDesk`；
- 客户工作区名称与 Logo 作为配置显示，不覆盖产品核心品牌和代码命名；
- 中文优先；
- 干净、克制、专业；
- 使用统一间距、圆角和字级；
- 不使用夸张渐变、过量动画和营销落地页风格；
- Loading 使用 Skeleton 或明确进度；
- 成功、失败、断线、同步中状态必须清楚；
- 空状态给出下一步操作；
- 桌面优先，同时保证窄屏可以折叠左右栏。

### 10.5 体验原则

1. 用户输入永不因刷新或网络失败丢失。
2. Agent 运行中可以停止。
3. 页面刷新后可恢复当前会话和流状态，至少能重新同步最终结果。
4. 所有按钮防重复点击。
5. 上传和生成失败时保留已输入参数。
6. 删除和清空操作必须二次确认。
7. 错误提示面向普通用户，同时日志保留技术详情。

---

## 11. 安全要求

即使是内网，也按“不完全可信网络”处理。

1. 密码不写入前端 Bundle。
2. 使用 HttpOnly、SameSite=Lax 的签名 Cookie；HTTPS 下设置 Secure。
3. 密码使用常量时间比较；若持久化用户密码则使用 Argon2id 或 bcrypt。
4. 所有修改接口校验 Origin/Host，避免基础 CSRF。
5. Markdown 必须经过安全清洗；禁止直接渲染 Agent 返回的任意 HTML。
6. 文件名、路径、MIME、大小全部服务端校验。
7. Runtime 密钥、Cookie Secret、加密密钥不得写入日志。
8. 不将 Runtime API Key 返回浏览器。
9. Runtime Base URL 由管理员配置并做协议和主机校验，防止 SSRF。
10. Runtime 资产下载只允许配置白名单主机。
11. 不提供任意本机文件读取 API。
12. 数据库查询必须参数化；禁止字符串拼 SQL。
13. 生产环境关闭详细堆栈返回，但保留结构化服务端日志。
14. 默认安全响应头：CSP、X-Content-Type-Options、Referrer-Policy、frame-ancestors。
15. 上传目录不得作为可执行代码目录。

---

## 12. SQLite 与可靠性

应用启动时确保：

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
```

规则：

- 数据库必须位于 Web 服务所在机器的本地磁盘，不放在 SMB/NFS 网络共享盘。
- 多表写入使用事务。
- Schema 变更只能通过 migration。
- migration 不得静默删除用户数据。
- 所有出站消息和文件关联写入必须可幂等重试。
- 进程异常退出后，启动时扫描 `streaming/running` 状态并标记为 `interrupted`，再尝试从 Runtime 同步。
- Runtime 调用设置连接超时、空闲超时和总超时；超时值可配置。
- 只对网络中断、429 和临时 5xx 做有限重试；业务错误不自动无限重试。
- 日志使用结构化字段，包含 requestId、conversationId、runId，但不记录密钥和完整敏感文件内容。

---

## 13. 备份与恢复

### 13.1 备份内容

完整备份必须包含：

- SQLite 一致性快照；
- `uploads/`；
- `artifacts/`；
- `thumbnails/`；
- 非敏感配置和版本信息。

### 13.2 实现

提供：

```bash
pnpm backup
pnpm restore -- <backup-file>
```

或等价脚本。

要求：

- 使用 SQLite Backup API 或 `VACUUM INTO` 创建一致性快照；不要在写入期间直接裸复制数据库文件。
- 备份先写临时文件，完成后原子重命名。
- 生成 `manifest.json`，记录应用版本、Schema 版本、时间和文件校验和。
- 默认保留：7 个每日、4 个每周、3 个月度备份；V1 可先实现每日保留策略，但文档要说明。
- 恢复前自动备份当前数据。
- V1 可以只提供命令行恢复，避免网页误操作。

---

## 14. API 建议

路由可以调整，但职责需保持清晰。

```text
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/session

GET    /api/runtime/health
GET    /api/runtime/capabilities
GET    /api/runtime/profiles

GET    /api/conversations
POST   /api/conversations
GET    /api/conversations/:id
PATCH  /api/conversations/:id
POST   /api/conversations/:id/sync
GET    /api/conversations/:id/messages
POST   /api/conversations/:id/messages       # 返回 SSE/stream
POST   /api/conversations/:id/cancel

POST   /api/uploads
GET    /api/assets/:id

GET    /api/accounts
POST   /api/accounts
PATCH  /api/accounts/:id

GET    /api/contents
POST   /api/contents
GET    /api/contents/:id
PATCH  /api/contents/:id
POST   /api/contents/:id/self-check
POST   /api/contents/:id/context-resync
POST   /api/contents/:id/select-cover

GET    /api/schedules
POST   /api/schedules
PATCH  /api/schedules/:id
DELETE /api/schedules/:id

POST   /api/backups
GET    /api/backups
```

所有请求和响应使用 Zod 校验；错误使用统一结构：

```ts
interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}
```

---

## 15. 环境变量

提供 `.env.example`，至少包含：

```dotenv
RELAYDESK_NAME=RelayDesk
RELAYDESK_HOST=0.0.0.0
RELAYDESK_PORT=3000
RELAYDESK_TIMEZONE=Asia/Shanghai
RELAYDESK_PASSWORD=change-me
RELAYDESK_SESSION_SECRET=replace-with-a-long-random-secret
RELAYDESK_DATA_DIR=/app/data
RELAYDESK_DATABASE_URL=file:/app/data/relaydesk.db

RELAYDESK_RUNTIME_TYPE=hermes
RELAYDESK_HERMES_BASE_URL=http://hermes:8787
RELAYDESK_HERMES_API_KEY=
RELAYDESK_HERMES_DEFAULT_PROFILE=
RELAYDESK_HERMES_PROTOCOL=auto
RELAYDESK_RUNTIME_ASSET_ALLOWED_HOSTS=hermes,127.0.0.1,localhost
RELAYDESK_RUNTIME_SHARED_PATHS=

RELAYDESK_MAX_UPLOAD_BYTES=52428800
RELAYDESK_MAX_IMAGE_BYTES=20971520
RELAYDESK_STREAM_FLUSH_INTERVAL_MS=750
RELAYDESK_RUNTIME_CONNECT_TIMEOUT_MS=10000
RELAYDESK_RUNTIME_TOTAL_TIMEOUT_MS=600000
RELAYDESK_LOG_LEVEL=info
```

规则：

- `.env` 不提交；
- `.env.example` 不含真实密钥；
- 服务启动时使用 Zod 校验配置并快速失败；
- 设置页只显示脱敏配置和连接状态。

---

## 16. Docker 与部署

默认命名：

- Compose service：`relaydesk`
- Docker image：`relaydesk`
- 持久化 volume：`relaydesk-data`
- 容器内数据目录：`/app/data`
- SQLite 文件：`/app/data/relaydesk.db`

V1 必须提供：

```bash
docker compose up -d
```

启动后通过：

```text
http://<内网服务器IP>:3000
```

访问。

要求：

- `data/` 使用持久化 volume 或明确的 bind mount；
- 容器以非 root 用户运行；
- 提供 `/api/health` 或 `/healthz`；
- Compose Healthcheck 验证 Web、SQLite 和数据目录；
- Hermes 连接失败不应让 Web 无法启动，UI 显示离线并允许查看历史；
- README 写清内网防火墙端口、启动、升级、备份和恢复。

---

## 17. 测试要求

### 17.1 必须有 Mock Runtime

`MockConnector` 必须支持：

- 会话列表；
- 新建会话；
- 文本流式回复；
- 模拟工具事件；
- 模拟生成图片资产；
- 模拟中断、超时和错误；
- 可重复、确定性的测试数据。

不依赖真实 Hermes 才能完成大部分开发和 CI。

### 17.2 单元测试

至少覆盖：

- Hermes 事件到 `ChannelEvent` 的映射；
- 消息幂等 upsert；
- 流式缓冲与最终落库；
- 文件路径安全；
- SHA-256 去重；
- 内容标题提取；
- 自检 Prompt 组装；
- 封面快捷消息组装；
- 权限和 Origin 校验；
- 备份 Manifest。

### 17.3 集成测试

至少覆盖：

- migration 后可正常读写 SQLite；
- 新建会话和发送 Mock 流；
- 中断流后恢复；
- 上传文件、落盘、建立资产记录；
- 保存消息为内容；
- 自检结果关联；
- 排期 CRUD；
- 重复同步不产生重复消息和资产。

### 17.4 E2E

至少一条完整路径：

```text
登录
→ 选择操作者
→ 创建内容账号
→ 新建会话
→ 发送消息
→ 查看流式回复
→ 上传图片
→ 请求生成封面
→ 保存回复为内容
→ 发起内容自检
→ 选择封面
→ 设置排期
→ 刷新页面并确认数据仍存在
```

### 17.5 质量门槛

提交前运行：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

涉及核心流程时还需：

```bash
pnpm test:e2e
```

禁止通过关闭 TypeScript strict、广泛使用 `any` 或跳过测试来“修复”构建。

---

## 18. 编码规范

1. TypeScript 开启 `strict`。
2. 外部数据一律 `unknown`，经 Zod 或明确 Mapper 后使用。
3. 禁止无说明的 `any`；确需使用时限制在 Connector 边界并注明原因。
4. 使用小而明确的函数；避免上千行组件和巨型 Route Handler。
5. 命名以业务含义为主，不使用模糊的 `data`、`info`、`handleThing`。
6. 时间数据库统一存 UTC Unix 毫秒，界面按 `RELAYDESK_TIMEZONE` 显示。
7. ID 使用 UUID/ULID，不依赖自增 ID 作为外部标识。
8. 业务状态用受控 union/enum，不能散落魔法字符串。
9. 重要事务、同步和文件操作写结构化日志。
10. 用户可见错误使用中文；内部错误码使用英文常量。
11. 注释解释“为什么”，不要重复代码做了什么。
12. 不无理由重写已有可用模块。
13. 不在一次任务中混入与需求无关的大规模格式化或重构。
14. DB migration、公共接口和环境变量变更必须同步文档。

---

## 19. Codex 实施顺序

除非已有代码要求不同，按以下阶段推进。每阶段完成后运行相关测试。

### Phase 0：仓库审计

- 查看现有目录、依赖、README、环境变量、Docker 和测试。
- 记录可复用部分和与本文件冲突之处。
- 若已有 Hermes WebUI Fork，优先复用消息、SSE、Session、附件和认证代码，但将新增业务模块隔离。
- 在 `docs/architecture.md` 写一页实际架构说明。

### Phase 1：基础工程

- 初始化 Next.js/TypeScript/shadcn（仅仓库为空时）。
- 配置 ESLint、TypeScript、Vitest、Playwright。
- 实现环境变量校验。
- 实现布局、共享密码登录和操作者选择。
- 实现 SQLite、migration、WAL 和 Repository 基础。
- 实现 Docker Compose、Healthcheck 和数据卷。

### Phase 2：Connector 与 Mock

- 定义内部 Runtime 合约和事件模型。
- 实现 `MockConnector`。
- 建立 Connector Registry。
- 实现 Runtime 健康状态和能力展示。
- 添加 Hermes Connector 骨架；只有在确认真实协议后完成端点映射。

### Phase 3：聊天与同步

- 账号 CRUD。
- 会话列表、新建、重命名、归档和搜索。
- 消息发送、SSE/ReadableStream、停止。
- 完整消息落库、run 和关键事件记录。
- 断线和刷新后的同步恢复。
- Tool/未知事件的安全展示。

### Phase 4：附件与产物

- 上传 API 和文件安全校验。
- 受控目录、原子写入、哈希和资产表。
- 将附件发送给 Runtime。
- 将 Runtime 返回图片/文件归档到本地。
- 图片预览、文件下载和消息关联。

### Phase 5：内容、自检、封面、排期

- “保存为内容”。
- 内容库、搜索、状态和备注。
- 右侧内容预览面板。
- 自检快捷操作和 review 历史。
- 封面首次生成、再生成、重新上传、选择最终封面。
- 简单排期列表和筛选。
- “同步当前内容到 Hermes”。

### Phase 6：体验与交付

- 统一视觉、Loading、Toast、空状态和错误状态。
- 完善中文文案。
- 完成备份脚本。
- 完成 README 和部署、备份恢复文档。
- 运行完整测试和生产构建。
- 用真实 Hermes 做一次端到端验收。

---

## 20. 完成定义（Definition of Done）

V1 只有满足以下条件才算完成：

1. `docker compose up -d` 可启动。
2. 内网其他电脑可通过浏览器访问。
3. 未登录无法访问工作区 API 和页面。
4. Hermes 离线时，历史内容仍可查看，UI 明确显示离线。
5. 能连接 Hermes、新建或继续会话并接收流式回复。
6. 文本、工具事件、图片和文件均可合理展示。
7. 所有完整消息写入 SQLite，重启后不丢失。
8. 重复同步不产生重复记录。
9. 用户上传和 Hermes 产物保存在服务器受控目录。
10. 内容账号可创建和筛选。
11. 某条回复可保存为内容并在内容库中查看。
12. 内容自检确实通过 Hermes 执行，结果可回看。
13. 可上传图片、请求生成封面、再次生成、重新上传并选择最终封面。
14. 可设置简单排期并从排期打开内容和来源会话。
15. 有一致性备份脚本和恢复文档。
16. 无浏览器端密钥泄露、任意路径读取、明显目录穿越和任意 URL SSRF。
17. `lint`、`typecheck`、`test`、`build` 全部通过。
18. 核心 E2E 通过。
19. README 说明安装、配置、数据目录、升级、备份、恢复和常见故障。
20. Web 代码没有直接调用 LLM 或图片模型供应商 API。

---

## 21. 明确禁止的实现方式

- 把 Web 做成新的 Agent Runtime。
- 在 Web 中直接配置和调用 OpenAI/Gemini/Claude 图片或文本 API。
- 将图片、视频等大文件写成 SQLite BLOB。
- 仅保存消息摘要而不保存完整消息。
- 每个 token 都写一次 SQLite。
- 页面直接读取数据库或 Hermes。
- 在多个页面复制 Hermes 请求逻辑。
- 把 Hermes 的内部事件结构直接暴露给所有 UI 组件。
- 用大量 `runtimeType === "hermes"` 分支污染业务代码。
- 为 V1 引入微服务、Redis、队列或 Kubernetes。
- 自动删除 Runtime 中已经不存在的本地历史。
- 未经白名单下载任意 URL。
- 将 Runtime 密钥放在 LocalStorage、客户端环境变量或日志中。
- 为赶工跳过 migration、备份、路径校验或幂等处理。
- 将所有业务逻辑堆在一个 `route.ts` 或一个 React 组件中。
- 把“排期”误做成内容平台自动发布。

---

## 22. 未来演进方向

这些只做接口和数据兼容预留，V1 不提前实现：

- `OpenClawConnector`；
- 多个 Runtime 连接；
- PostgreSQL Repository；
- S3/MinIO Storage Adapter；
- 多工作区和团队权限；
- 审批流；
- 高级日历；
- 自动发布连接器；
- 云端 SaaS；
- 会员和额度；
- 托管版；
- 开源核心与商业模块。

演进时保持：

```text
UI / 业务模块
      ↓
内部 Runtime 合约
      ↓
HermesConnector / OpenClawConnector
```

以及：

```text
业务数据库和文件资产独立于 Runtime
```

---

## 23. 最终提醒

本项目的价值不在于重新制造 AI 能力，而在于：

- 让团队更方便地与 Agent 沟通；
- 让所有消息、图片和文件可靠留存；
- 把散乱聊天整理成内容资产；
- 让自检、封面和排期成为可重复的界面操作；
- 允许未来更换或增加 Runtime，而不推倒 Web 和业务数据。

实现任何功能前都要问自己：

> 这属于 Web Channel 的通信、同步、展示或管理职责，还是本应由 Hermes/OpenClaw Runtime 负责？

若属于 Runtime，就只通过消息、附件和 Connector 调用，不在 Web 中重复实现。
