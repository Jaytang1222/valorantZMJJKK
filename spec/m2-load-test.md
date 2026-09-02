# 双人联机受控压测

脚本在本地 Docker 或 ECS 的测试环境运行，不依赖 Railway。压测前确认 API、PostgreSQL 和 Redis 使用隔离数据；不要对生产用户数据执行该脚本。

## 预检

```powershell
docker compose up -d
pnpm db:migrate
pnpm --filter @valo-yiba/api build
$env:LOAD_API_URL = "http://localhost:3001"
$env:LOAD_WS_URL = "http://localhost:3001"
$env:LOAD_ROUND_DURATION_SECONDS = "90"
$env:LOAD_RAMP_SECONDS = "30"
```

如使用 HTTPS 测试地址，不要关闭 TLS 校验；只有明确使用自签名证书的隔离环境才可临时设置 `NODE_TLS_REJECT_UNAUTHORIZED=0`。

## 运行

```powershell
pnpm --filter @valo-yiba/api load:versus
```

默认创建 100 个双人房，每个 worker 保持房间约 60 秒，再主动结束。输出包含认证、Socket 连接、建房、入房、准备、开始和结束的 P50/P95/最大延迟，以及 `failures` 列表。

## 通过标准

- `failures` 为空。
- 所有房间均完成唯一结算，胜者只增加 1 分。
- API、PostgreSQL、Redis 无重启、连接耗尽或 5xx 峰值异常。
- 压测结束后测试账号、房间和临时数据已清理。
