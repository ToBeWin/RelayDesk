# Agent 主机、Profile 与成员授权

RelayDesk 将身份与 Agent Runtime 分开管理：Hermes 的 `API_SERVER_KEY` 是服务凭据，不是员工账号。员工只登录 RelayDesk，浏览器不会获得任何 Hermes Key。

## Hermes 侧准备

每个 Profile 是独立 Hermes Home，拥有自己的配置、Sessions、Memory、Skills 和状态。每个同时运行的 Profile 必须使用不同 API Server 端口。

```bash
hermes profile create content --clone
hermes profile create research --clone
```

分别在 Profile 的 `.env` 中设置 `API_SERVER_ENABLED=true`、独立的 `API_SERVER_PORT` 和随机 `API_SERVER_KEY`。远程电脑应只在内网绑定，并由防火墙只允许 RelayDesk 服务器访问。

```bash
hermes -p content gateway install
hermes -p content gateway start
```

## RelayDesk 首次初始化

1. 首位用户使用工作区密码登录后成为管理员。
2. 若 RelayDesk 与 Hermes 在同一台电脑，打开“系统设置”即可自动检测 `~/.hermes` 下的可用 Profile、端口和健康状态；点击“一键关联可用 Profile”即可登记，API Key 只在服务端读取并加密保存。
3. 对其他内网电脑，先登记运行 Hermes 的电脑，再使用“发现新 Hermes Profile”探测管理员明确填写的端口；探测 Key 不保存。
4. 登记 Profile、端口、共享模式和 Key。RelayDesk 验证 `/health`、`/v1/capabilities` 和 `/v1/models` 成功后才保存。
5. 在“成员授权”为员工分配 Agent 和权限。设置页的部署引导会显示“已授权成员 / 活跃成员”，直到每位活跃成员都拥有至少一个可聊天 Agent。

Key 使用 `RELAYDESK_CREDENTIALS_KEY` 进行 AES-256-GCM 加密。生产环境使用 `openssl rand -hex 32` 生成独立密钥。备份恢复时必须安全恢复同一个 Key，否则托管凭据无法解密。

## 后续新增 Profile

在目标电脑创建 Profile、配置独立端口和 Key、启动 Gateway，然后回到 RelayDesk 探测并登记。对于与 RelayDesk 同机的 Profile，直接在“系统设置”重新检测即可。两种方式都无需修改 RelayDesk `.env`，也无需重启 RelayDesk。

## 多电脑结构

```text
内容工作站 01 / 192.168.1.20
  content  :8643
  research :8644

设计工作站 02 / 192.168.1.30
  image    :8642
  video    :8643
```

RelayDesk 只允许 localhost、RFC1918 私有 IPv4 或 `RELAYDESK_RUNTIME_ALLOWED_HOSTS` 明确列出的主机。

## 共享、独占与隔离

- `shared`：允许多个成员访问同一 Profile，Hermes Workspace、Memory 和 Skills 也会共享。
- `dedicated`：数据库事务保证只能授权一个成员，适合私人助理和敏感工作。

RelayDesk 隔离每个成员的 Web 会话、消息和文件，但不能把同一个 Hermes Profile 的内部 Memory 变成多租户。需要严格隔离时必须创建独立 Profile。

## 多电脑文件边界

Hermes API Server 支持内联图片，但文档附件采用同机受控目录桥接。RelayDesk 与目标 Hermes 必须都能读取同一个绝对路径，才能让 Agent 使用 PDF、Office 文档或其他文件。建议优先把需要文档协作的 Hermes Profile 与 RelayDesk 部署在同一台电脑；若必须跨电脑，应由运维为两端挂载同一个受控共享目录，并确保挂载路径完全一致。没有这个前提时，RelayDesk 会拒绝把文档伪装成“已发送”，图片仍可通过 API 发送。

## 权限

- `chat`：创建 Session 并继续发送消息。
- `upload`：向 Agent 发送文件。
- `view_history`：读取和同步历史私聊。

撤权后下一次请求立即生效。停用成员后其 Cookie 无法再映射到有效成员。

## Key 轮换与离职

在 Agent 卡片点击“轮换 Key”。RelayDesk 先验证新 Key，成功才原子替换密文。

员工离职时停用账号并清空 Agent 授权，保留会话和审计记录。如果员工接触过 Hermes Key，还应在 Hermes 侧轮换该 Key。

主机、Agent、Key 和授权管理操作都会写入 `audit_logs`，管理员可在系统设置查看。
