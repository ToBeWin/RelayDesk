# Deployment

## Native single-machine deployment

Hermes 与 RelayDesk 在同一台电脑运行时，原生 Node 部署是推荐方案，因为 Hermes 可以直接读取 RelayDesk 受控上传目录。

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

设置 `RELAYDESK_HOST=0.0.0.0` 后，团队成员可通过 `http://<服务器局域网IP>:3000` 访问。生产启动会强制要求显式配置工作区密码、至少 32 字符的 Session Secret，以及独立的 `RELAYDESK_CREDENTIALS_KEY`；缺少任意一项会拒绝启动。

真实 Hermes 配置：

```dotenv
RELAYDESK_RUNTIME_TYPE=hermes
RELAYDESK_HERMES_BASE_URL=http://127.0.0.1:8642
RELAYDESK_HERMES_API_KEY=<API_SERVER_KEY>
RELAYDESK_RUNTIME_SHARED_PATHS=/Users/you/.hermes,/Users/you/Desktop
RELAYDESK_RUNTIME_ALLOWED_HOSTS=127.0.0.1,localhost,::1
RELAYDESK_CREDENTIALS_KEY=<openssl rand -hex 32>
```

管理员可在“系统设置”中登记多个 Hermes Agent API Server。每个实例的 `apiKeyEnv` 指向 `.env` 中独立的 `RELAYDESK_*` 变量；RelayDesk 不把密钥返回浏览器。
RFC1918 私有 IPv4 可由管理员直接登记；内网 DNS 名称必须加入 `RELAYDESK_RUNTIME_ALLOWED_HOSTS`，例如 `agent.internal`。
通过管理界面托管的 Hermes Key 使用 `RELAYDESK_CREDENTIALS_KEY` 加密；备份恢复时必须恢复相同密钥。

## Docker deployment

```bash
docker compose up --build -d
docker compose ps
curl --fail http://127.0.0.1:${RELAYDESK_PORT:-3000}/api/health
```

Compose 会通过 `.env` 注入多 Agent 凭据，并提供 `host.docker.internal` 访问宿主机 Hermes。在 macOS/Windows 上把 Hermes URL 写成 `http://host.docker.internal:8642`，不要使用容器内的 `127.0.0.1`。

文本对话和远程图片可直接工作。文档桥接要求 RelayDesk 与 Hermes 看到完全相同的绝对路径；因此宿主机 Hermes + RelayDesk 容器的组合不建议用于文档附件。需要容器部署文档桥接时，应让 Hermes 一同容器化，并把同一共享卷挂载到两个容器的相同路径。否则使用上面的原生部署。

数据持久化在 `relaydesk-data` 卷。升级前先从设置页创建备份；恢复流程见 [backup-restore.md](backup-restore.md)。
