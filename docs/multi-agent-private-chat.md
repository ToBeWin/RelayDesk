# 多 Agent 私聊模型

## 目标

RelayDesk 是公司内部员工与 Hermes Agent 的私聊工作台。它不实现群聊，也不迁移钉钉、飞书或企业微信的历史。

## 领域模型

- **员工成员**：登录 RelayDesk 的内部人员。
- **Hermes Agent 实例**：一个独立部署/复制的 Hermes Agent，拥有自己的工作目录、会话目录、Skills 和运行配置。
- **成员授权**：员工可以被授予一个或多个 Agent 实例的私聊权限；同一个 Agent 可以授予多位员工。
- **私聊会话**：必须同时归属一个成员和一个 Agent 实例。默认只允许该成员查看、创建、发送、重命名和归档自己的会话。

内容运营账号 `content_accounts` 仍然只表示内容发布账号，不能用于表示员工、Hermes 身份或私聊权限。

## 私聊 Memory 语义

RelayDesk 采用与 Hermes 原生钉钉、飞书等私聊 Channel 一致的两层模型：

| 范围 | RelayDesk 行为 |
| --- | --- |
| **短期对话上下文** | 每个 RelayDesk 会话创建一个独立 Hermes `session_id`。同一成员开启两个“新会话”时，两个 transcript 不会互相注入。 |
| **长期私聊 Memory** | RelayDesk 对每个“成员 + Agent”发送稳定的 `X-Hermes-Session-Key`，格式为 `relaydesk:{agent-id}:{member-id}`。同一成员在同一 Agent 下的新会话可延续自己的长期记忆；不同成员即使被授权到同一 Agent，也会使用不同的 Hermes Memory scope。 |

这正是原生 Gateway 的私聊模式：稳定 Channel/session key 代表一个人和 Agent 的私聊通道，而 `/new` 或 Web 中的新对话只更换短期 transcript，不更换该私聊通道的长期记忆。

### 严格隔离边界

`X-Hermes-Session-Key` 能隔离支持该官方 scope 的长期 Memory Provider（例如 Honcho）。它**不能**把同一个 Hermes Profile 的所有 Profile 级资源变成多租户：`MEMORY.md`、`USER.md`、工作区文件、Skills、MCP 配置和工具副作用仍属于同一个 Profile。

因此：

- 员工使用同一共享 Agent 时，RelayDesk 会隔离私聊 transcript 和支持 scope 的长期 Memory；
- 涉及高度敏感资料、独立文件工作区或绝对零共享时，应在 Hermes 侧为该员工创建独占 Profile，并在 RelayDesk 中登记为 `dedicated` Agent；
- 内容运营账号不是员工身份，不能作为 Memory 隔离键。Memory 隔离键始终取 RelayDesk 登录成员与 Agent 实例。

## 官方 Hermes Profiles

Hermes 官方推荐使用 Profiles 运行同机多 Agent。每个 Profile 都有独立的 Hermes Home，其中包含 `config.yaml`、`.env`、`SOUL.md`、Memory、Sessions、Skills、Cron 和 Gateway 状态。

```bash
# 复制当前 Agent 的配置、密钥与人格，但使用全新的 Memory 和会话。
hermes profile create marketing --clone

# 为该 Profile 单独配置 API Server。
cat >> ~/.hermes/profiles/marketing/.env <<EOF
API_SERVER_ENABLED=true
API_SERVER_PORT=8643
API_SERVER_KEY=replace-with-a-unique-secret
EOF

# 启动该 Profile 的 Gateway/API Server。
hermes -p marketing gateway
```

官方多用户示例为每个 Profile 使用不同端口；RelayDesk 应将 `http://127.0.0.1:8643` 作为 `marketing` 的独立 Agent 实例入口。参考：[Profiles](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/profiles.md) 和 [API Server](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/api-server.md)。

## 运行时要求

Hermes API 协议相同不代表运行时实例相同。RelayDesk 必须能明确选定一个 Agent 实例，方式只能是：

1. 每个 Profile/Agent 实例运行在独立的 API Base URL/端口；或
2. 未来 Hermes 官方 API 提供经验证的 Agent/Workspace 选择字段或请求头。

不能通过在 RelayDesk 中伪造 Profile、会话标题或员工名称来切换 Hermes 工作目录。

## 文件流程

当前 Hermes API Server 不支持文件上传、`file`、`input_file` 或 `file_id` 文档输入；官方 API 支持内联图片。对于同机部署，RelayDesk 使用受控共享目录桥接处理文档等文件：

1. 员工文件先上传到 RelayDesk 管理目录；
2. 仅当 Agent 实例明确配置可访问的共享目录时，RelayDesk 才向该实例发送带本机受控路径的附件清单；
3. Hermes 返回 `MEDIA:/absolute/path` 时，RelayDesk 只从该实例配置的白名单目录复制到 `data/artifacts/`；
4. 浏览器只访问 RelayDesk 的受控资产 URL，并预览图片或下载文件。

远程 Hermes 或没有共享目录的部署不能发送文档附件；不得将路径文本标记为“已上传”。图片将通过官方 OpenAI-compatible `chat_completions` 内容部件另行接入。

## 后续数据表

```text
agent_instances
  id / name / runtime_type / base_url / workspace_label / encrypted_credentials / enabled

member_agent_access
  member_id / agent_instance_id / enabled / granted_by / created_at

conversations
  owner_member_id / agent_instance_id / external_session_id / ...
```

`member_agent_access` 只做私聊授权，不包含群聊成员、消息转发或跨员工会话可见性。
