# 上线收尾审计与发布验收

审计日期：2026-08-24
审计分支：`staging`
审计提交：`90f5f76 feat: add player data notices`

## 结论摘要

当前代码的格式检查、lint、类型检查、单元测试、构建和数据库集成测试均通过，首页、健康检查、公开选手目录、游客单人对局、注册会话、单人八次猜测结算、管理员接口鉴权和联机一房间闭环均已在本地验证。

但当前版本不建议直接合并到 `main` 面向不受控的真实用户上线。原因不是构建失败，而是以下运行期问题会影响实际用户或运营资料的正确性：

1. Web 到 API 的代理没有传递可信的用户来源标识，API 限流很可能按 Vercel 服务端出口地址共享计数，少量用户就可能共同触发注册、登录、猜测或实时票据的 429。
2. API Dockerfile 每次容器启动都会执行 `db:seed`。这会把仓库 CSV 中的旧资料再次写成最新快照，可能覆盖管理员在后台修订的资料。
3. 管理 API 固定只返回 500 条最新快照，而当前公开选手超过 1,000 名，后台无法完整查看和维护资料。
4. 活动联机房间只从 Redis 恢复，API 重启后无法从 PostgreSQL 恢复活动房间；进程内的回合超时和断线 20 秒判负定时器也不会自动恢复。

因此建议：先修复上述四项，再完成 staging 回归和人工验收，然后创建 PR 合并 `main`。如果必须先做小范围软启动，应明确告知用户联机服务会受 Railway 重启影响，并暂停高频公开推广。

## 已执行的检查

### 自动化检查

以下命令在本地 PostgreSQL 16 和 Redis 7 容器已启动的条件下通过：

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @valo-yiba/api test:integration
pnpm build
pnpm --filter @valo-yiba/api players:validate ../../data/players.seed.csv
pnpm --filter @valo-yiba/api smoke
```

集成测试必须提供 `RUN_DATABASE_TESTS=true` 和 `PASSWORD_PEPPER`。未提供 `PASSWORD_PEPPER` 时登录接口会按配置错误返回 500，补齐临时测试密钥后集成测试为 3/3 通过。

已验证的集成测试包括：

- Redis 房间清理后，投降比赛仍在 PostgreSQL 中保留，双方战绩均可重建。
- 未带内部密钥的后台请求返回 401。
- 未认证的对手资料请求返回 401。
- 登录输入校验返回 400，连续失败登录触发 429。
- 最新选手快照更新保留版本并将审核状态重置为 `pending_review`。

Docker 镜像构建在本机因 Docker Hub 拉取 `node:22-alpine` 时网络连接失败，未能完成本机镜像构建；这不是 Dockerfile 语法或 TypeScript 构建错误。CI 之前已通过仓库构建流程，正式发布仍应以 Railway 构建日志为准。

### 数据库快照

以下数字是本地数据库执行迁移并使用当前 `data/players.seed.csv` 同步后的结果，不等同于远程 Railway 数据库的独立查询：

- active players：1,004
- approved player snapshots：1,301
- 最新快照分区：Americas 199、EMEA 264、Pacific 284、China 257
- 初始 `puzzles` 为 0 是预期行为；首次开始单人或联机对局时按选中快照动态创建 approved puzzle。

上线前必须在 Railway PostgreSQL 上再次执行只读统计，记录实际数字：

```sql
select count(*) from players where status = 'active';
select count(*) from player_snapshots where review_status = 'approved';
select region, count(*)
from (
  select distinct on (player_id) player_id, region
  from player_snapshots
  where review_status = 'approved'
  order by player_id, data_version desc
) latest
group by region
order by region;
```

### 实际流程检查

已通过的本地接口流程：

- `GET /health` 返回数据库和 Redis 均为 `ok`。
- `GET /v1/players?limit=5000` 返回完整公开目录，当前 1,004 条，别名可参与客户端搜索。
- 游客可分别创建 `beginner`、`easy`、`full` 对局并放弃；游客 ID 被保留且不进入排行榜。
- 单人连续提交 8 次错误后状态为 `lost`，第 8 次才揭示答案，比较结果存在。
- Web 注册成功后 `/api/auth/me` 能恢复同一用户，实时票据可签发；空战绩的 `/api/account/summary` 返回 `solo: null`、`versus: null` 和空的 `recentGames`，页面应显示空态。
- 未认证的 `/api/admin/csv-import` 返回 401；管理员会话访问 `/admin` 返回 200；CSV 预检返回有效行数且不写入数据库。
- 使用隔离 Redis 的联机一房间闭环通过：注册、票据、Socket 连接、建房、加入、准备、开始、投降、+1 结算和房间清理均成功。

当前会话没有可用的浏览器自动化通道，因此视觉、点击、键盘和移动端布局尚未由自动浏览器完成；必须按本文的人工验收清单在 staging 实际浏览器中执行。

## 必须上线前处理的问题

### P0：代理后的限流身份

相关代码：`apps/api/src/app.ts`、`apps/api/src/routes/auth.ts`、`apps/api/src/routes/solo.ts`、`apps/web/app/api/auth/[action]/route.ts`、`apps/web/app/api/solo/[...path]/route.ts`。

当前 Web Server Action/Route Handler 调用 API 时没有转发可信的最终用户 IP，Fastify 也没有配置受控的 `trustProxy`/keyGenerator。生产 API 看到的可能是同一个 Vercel 出口地址，因此以下限流可能被所有用户共享：注册 5 次/小时、登录 10 次/15 分钟、实时票据 30 次/分钟、单人猜测 20 次/分钟。

上线前选择并实现一种方案：

- 在 Vercel 代理层按用户请求做限流，并将一个仅由代理生成/签名的来源标识传给 API；或
- 配置受控代理信任范围和限流 key，只有来自 Vercel/内部代理的请求才能使用该标识，不能直接信任公网任意 `x-forwarded-for`。

完成后至少验证两名不同用户可同时注册、登录、获取实时票据和提交猜测，且一名用户的限流不会阻断另一名用户。

### P0：启动时自动同步 CSV

相关代码：`apps/api/Dockerfile:31`、`apps/api/src/server.ts:9-17`、`apps/api/src/services/initial-seed.ts:116-153`。

Docker `CMD` 当前为迁移、`seed.js`、启动服务。`seed.js` 每次启动读取仓库 CSV；当后台已编辑最新快照后，只要 CSV 与数据库不完全一致，就会插入新的快照。这样 stale CSV 可能重新成为最新 approved 资料，后台修订会在重启后被覆盖。

上线前应：

1. 移除生产容器启动链中的无条件 `node dist/scripts/seed.js`。
2. 将首批导入改为一次性、显式、可审计的运维命令，只在独立环境确认后运行。
3. 保留 `SEED_INITIAL_DATA` 为默认关闭，并在 Railway 和 Vercel/CI 中确认没有残留。
4. 做一次“后台编辑 -> API 重启 -> 公开目录仍显示编辑结果”的回归测试。

### P1：后台固定 500 条

相关代码：`apps/api/src/routes/admin.ts:239-319`、`apps/web/app/admin/page.tsx`。

后台快照查询固定 `.limit(500)`，当前数据量已超过 1,000。管理员无法通过筛选或页面看到所有最新选手，资料维护流程不完整。

建议使用服务端分页（`limit`、`cursor`、`total`），并在页面显示当前页与总数。完成后验证首个、跨页和最后一个选手均可编辑，且只显示每个选手最新快照。

### P1：联机房间和定时器的重启恢复

相关代码：`apps/api/src/services/room-store.ts:128-140`、`apps/api/src/realtime.ts:122-175`、`apps/api/src/realtime.ts:649-679`。

房间实时状态写入 Redis，PostgreSQL 只保存审计结果；`loadRoom` 不从 PostgreSQL 恢复活动房间。回合超时、断线 20 秒判负和结束房间清理依赖当前 Node 进程内的 `setTimeout`。Railway 重启、崩溃或部署切换期间，活动房间会变成不可恢复，定时器也会丢失。

上线前至少选择一种策略：

- 将可恢复的活动房间状态和截止时间持久化 PostgreSQL，并在启动时扫描恢复；或
- 明确做优雅停机：部署前阻止新房间、通知活动房间并结算/取消，再允许实例退出。

无论选择哪种策略，都要测试“对局中重启 API、双方重新连接、20 秒判负和 5 分钟超时”四条路径。

## 应当上线前处理的问题

### P1：后台风控动作的实际效果

`restrict_account` 已可写入 `moderation_actions`，但认证、建房、匹配、猜测和实时票据路径没有读取该动作并拒绝用户。若后台未来调用该动作，页面上看似限制成功，实际上用户仍可继续游戏。修复前不要在运营界面暴露该动作，或补齐所有入口的统一风控检查并加集成测试。

### P1：90 天保留期限没有自动清理任务

隐私文案写明账户和审计数据默认保留 90 天，但仓库中没有定时清理任务、Railway Cron 或等价运维流程。若这是实际承诺，应增加可审计的清理任务和保留例外；否则应把文案改为准确描述人工处理规则。账户自助导出/删除当前按产品决策不做，但邮箱人工申请入口必须继续可用。

### P2：英文文案品牌不一致

中文 `nav.brand` 已为“康一把”，但英文文案仍有 `VALO YIBA`，例如 `apps/web/app/lib/i18n.ts` 的英文 `nav.brand` 和 `privacy.operator`，CSS 注释及 README 也保留旧名称。若要求所有标识统一为“康一把”，应在上线前统一可见文案、metadata、隐私/条款和 README；若保留英文 locale，应明确英文品牌展示规则。

### P2：单人创建和放弃的资源/并发边界

`POST /v1/solo/attempts` 没有创建频率限制或同用户 active attempt 上限，自动化请求可制造大量 active rows。放弃接口使用条件更新，但没有检查 `returning` 结果；两个并发放弃请求可能都返回成功。建议增加按用户/来源的创建限制、过期 active attempt 清理，并为并发放弃补充回归测试。

### P2：断线处理的线性扫描

Socket 断开时会执行 `redis.keys("valo:room:*")` 扫描所有房间。房间规模扩大后会增加 Redis 阻塞风险。上线初期规模较小时可接受，但应记录为后续优化，改为用户到房间的反向索引。

## 管理页人工验收流程

使用生产或 staging 的管理员账号，不要把密码写入仓库或截图：

1. 打开 `/admin`，确认未登录只能看到登录表单，错误密码不会进入列表。
2. 登录后确认列表显示“最新快照”语义，不展示旧版本；检查分页/总数修复后能覆盖全部选手。
3. 使用筛选验证名称、别名、赛区、队伍、状态和审核状态。
4. 打开一个选手详情，修改队伍、状态、位置、冠军赛冠军次数、大师赛冠军次数、联赛冠军次数、来源和 `dataAsOf`，保存后确认出现待审核状态。
5. 返回列表批准该快照，确认公开 `/players` 和下一局题库使用新资料。
6. 添加一个别名，确认公开搜索可命中；删除别名后确认不再命中。
7. 禁用选手，确认他不再出现在公开目录、三档单人题库和联机题库；历史已结算记录仍能显示。
8. 用 CSV 做 Preview，确认错误行只报告不写库；确认无错误后 Apply，再批准对应最新快照。
9. 退出管理员会话，重新打开页面确认回到登录态；直接请求内部 API 不带 `x-internal-api-secret` 必须为 401。

## Staging 人工回归清单

建议使用两个独立已注册账号、两个浏览器标签页和一个移动端视口：

- 首页：品牌、API 在线状态、三个入口、GitHub Star 链接、隐私/条款/资料来源/更正入口。
- 查选手：默认加载全部、总数正确、输入 `z` 可找到 `zmjjkk` 等非首字母候选、别名和队伍搜索正确、移动端无横向滚动。
- 单人：游客进入三档难度；输入/键盘选择候选；每局最多 8 次；正确、8 次失败、放弃均可结算；结算后答案与全部信息显示；错误数据声明可见。
- 注册与账户：邮箱密码注册、随机默认名、刷新后仍登录、错误密码、退出、空战绩和有战绩页面。
- 联机建房：固定 6 位邀请码、只能双人 BO1、双方准备后开始、双方同时猜测、对手只显示颜色和进度、投降胜者 +1、失败者/胜者均可返回菜单。
- 联机恢复：断线提示和 20 秒倒计时；20 秒内恢复原房；超过 20 秒判负；结束后可返回菜单；房间不会残留在再次进入页面。
- 联机匹配：两名用户可匹配；取消匹配后不再被匹配；异常断线不会阻塞其他用户。
- 账户战绩：投降、正常结束和断线判负都出现在双方最近 3 局/统计中；联机公开排行榜仍显示“后续开放”而不是伪造数据。
- `/admin`：按上一节完整走一遍。

## 发布流程

### 修复完成后从 staging 到 main

1. 在 `staging` 完成修复，运行格式、lint、类型、单测、集成测试和构建。
2. 推送 `staging`，等待 Railway staging 和 Vercel Preview 部署成功。
3. 按本文 staging 清单完成两账号回归，并保留时间、提交号和失败截图/日志。
4. 创建 `staging -> main` PR；确认 CI 的 `format:check`、迁移和数据库集成测试全绿。
5. 合并 PR 后确认 `main` 的 Railway/Vercel 生产部署使用同一提交；不要在生产设置 `SEED_INITIAL_DATA=true`。
6. 发布后立即检查：`/health`、首页 API 状态、公开目录数量、注册/登录、单人开局和联机票据。

### 生产环境变量核对

Railway API 至少需要：`DATABASE_URL`、`REDIS_URL`、`SESSION_SECRET`、`PASSWORD_PEPPER`、`INTERNAL_API_SECRET`、`RATE_LIMIT_PROXY_SECRET`、`CORS_ORIGIN`、`NODE_ENV=production`，以及已配置的 API Sentry 变量。

Vercel Web 至少需要：`API_BASE_URL`、`NEXT_PUBLIC_API_BASE_URL`、`NEXT_PUBLIC_WS_URL`、`USER_SESSION_SECRET`、`ADMIN_USERNAME`、`ADMIN_PASSWORD`、`ADMIN_SESSION_SECRET`、`RATE_LIMIT_PROXY_SECRET`，以及 Web Sentry 变量。所有 secret 至少 32 个随机字符；`INTERNAL_API_SECRET` 和 `RATE_LIMIT_PROXY_SECRET` 必须只存在于 Railway 和 Vercel 服务端环境，不能以 `NEXT_PUBLIC_` 名称暴露。

部署完成后确认：

- `CORS_ORIGIN` 只包含正式 Web 域名，不包含任意来源。
- `SEED_INITIAL_DATA` 未设置或不是 `true`。
- 生产日志没有数据库迁移失败、Redis 连接失败或管理员环境变量缺失。
- Railway healthcheck `/health` 为 200，Vercel 首页能请求 API。

## 回滚与上线后观察

1. 保留上一个已知可用的 Railway 和 Vercel 部署版本。
2. 出现健康检查失败、房间结算错误、登录大面积 429 或资料被覆盖时，先停止继续导入资料，回滚 Web/API 到上一版本。
3. 回滚后再次检查 `/health`、登录、单人结算和联机房间；数据库迁移不可逆时不要直接回滚迁移，先按对应迁移的兼容策略处理。
4. Sentry 观察 Web/API 错误、Socket 连接错误、数据库错误和 429；记录发布提交号、发生时间和影响用户数。
5. 上线首日人工抽查至少 10 局单人和 5 局联机，并核对 PostgreSQL 的 `solo_attempts`、`rooms`、`room_rounds`、`guesses` 和账户摘要。

## 最终放行标准

只有在 P0/P1 问题完成或由产品负责人明确书面接受风险后，以下条件同时满足，才建议合并 `main`：

- CI、staging 部署和数据库集成测试全绿。
- 两个真实用户的登录、单人、联机、断线恢复和结算流程通过。
- 后台可以覆盖全部最新选手，并且重启不会覆盖后台修订。
- 限流按用户/可信来源隔离，不会因 Vercel 共用出口误伤所有用户。
- 生产变量、CORS、Sentry、健康检查和回滚版本已核对。

## 决策与本轮实现状态（2026-08-24）

- 联机重启恢复采用 PostgreSQL 房间状态快照；Redis 缺失时从 `rooms.live_state` 恢复，并在 API 启动时重建回合超时、断线判负和结束房间清理定时器。
- 限流采用受控代理签名：Vercel 使用 `RATE_LIMIT_PROXY_SECRET` 对来源标识签名，API 验签后按授权会话或代理来源分桶；生产 API 未配置该密钥时拒绝启动。
- 生产 API 启动链只执行迁移和服务启动，不再自动执行 CSV seed。`db:seed` 仅作为显式、本地或人工确认后的运维命令。
- 管理选手快照接口已支持 `page`、`limit`、`total` 和 `totalPages`，页面可以覆盖全部最新快照。
- `restrict_account` 已从后台动作的创建与列表接口移除；数据库保留历史枚举值以兼容既有记录。
- 隐私文案已改为按运营需要保存，并通过邮箱人工受理删除与更正申请，不再承诺自动 90 天清理。

本轮仍需在 staging 完成真实 Railway 重启恢复、两用户限流隔离、管理员跨页编辑和生产环境变量核对，之后才可创建 `staging -> main` PR。Redis 全量 `KEYS` 扫描和单人 active attempt 资源上限仍属于小规模上线可接受的后续优化。
