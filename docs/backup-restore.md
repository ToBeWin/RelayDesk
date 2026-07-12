# Backup and Restore

管理员可在设置页或通过 `POST /api/backups` 创建在线一致性备份。RelayDesk 使用 SQLite backup API 合并 WAL 中已提交事务，再复制 `uploads/`、`artifacts/` 和 `thumbnails/`，最终原子写入 `data/backups/relaydesk-<timestamp>/`。

每个备份包含 `manifest.json`，记录所有数据库与资产文件的大小和 SHA-256。恢复命令会先验证完整清单，然后保存当前数据的临时回滚副本并替换受管数据；失败时自动恢复原数据。`backups/` 目录不会被覆盖。

```bash
# 必须先停止 RelayDesk，避免恢复期间有新写入。
pnpm restore ./data/backups/relaydesk-2026-07-11T00-00-00-000Z ./data

# 恢复后启动并检查。
pnpm start
curl --fail http://127.0.0.1:3000/api/health
```

不要在 RelayDesk 仍运行时执行恢复。建议定期把整个备份目录复制到另一块磁盘或受控备份设备。
