# M2 双人对战压测

此脚本只允许在 staging 执行。它会为每个房间创建两个临时测试账号，建立双人私密房，双方准备并开始对局，维持指定时长后由一方投降完成结算。

## 前置条件

- staging 的 Railway API 与 Vercel Preview 已部署当前 `staging` 提交。
- Railway staging 中 `SEED_INITIAL_DATA` 不存在或不为 `true`。
- 在本机仓库根目录执行命令，使用 staging API 公共域名，不使用生产域名。
- 测试会永久新增临时账号和对局审计记录；使用 staging 数据库即可接受。

## 小规模预检

在 PowerShell 中设置变量。`LOAD_PASSWORD` 使用仅用于 staging 的临时强密码，不要提交到仓库或发送给我。

```powershell
$env:LOAD_API_URL = "https://<railway-staging-api-domain>"
$env:LOAD_PASSWORD = "<temporary-staging-password>"
$env:LOAD_CONFIRM = "RUN_STAGING_LOAD"
$env:LOAD_ROOM_COUNT = "2"
$env:LOAD_WORKERS = "2"
$env:LOAD_HOLD_SECONDS = "15"
pnpm --filter @valo-yiba/api load:versus
```

预检应输出 JSON：`failures` 为空，且每个 `room_*` 指标都有样本。

## 100 活跃房间

确认预检通过、staging 没有其他测试人员后，保持前三个变量，改为：

```powershell
$env:LOAD_ROOM_COUNT = "100"
$env:LOAD_WORKERS = "100"
$env:LOAD_HOLD_SECONDS = "60"
pnpm --filter @valo-yiba/api load:versus
```

脚本会在建立完成后维持约 100 个活跃双人房 60 秒，再逐个结算。运行期间在 Railway 查看 API、PostgreSQL 与 Redis 的 CPU、内存、连接数和错误日志；保留命令输出与三个服务的峰值截图。

## 验收与回滚

- `failures` 必须为空，且 `room_create`、`room_join`、`room_ready`、`room_start`、`room_surrender` 的 P95 均记录在输出中。
- 目标是实时事件 P95 小于 300 ms；若未达标，记录 P95、峰值资源与错误日志，不进入 M3，先定位瓶颈。
- 出现持续错误、数据库连接耗尽或 Redis 内存快速增长时，按 `Ctrl+C` 停止压测。已创建的房间会在服务端 TTL/结算清理机制下回收；临时账号和审计记录保留在 staging 供排查。
