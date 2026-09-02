# 上线收尾审计

## 当前部署

- 生产：阿里云 ECS `47.120.3.39`，Docker Compose，域名 `https://zmjjkk33.top`。
- 验证：本地 Docker、GitHub Actions CI；Railway 已取消，不再作为运行环境。
- 数据库和 Redis 使用 ECS 持久化卷。API 启动只执行 Drizzle 迁移，不自动导入 CSV。

## 代码验收

合并 `main` 前必须通过：

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @valo-yiba/api test:integration
pnpm build
```

数据库集成测试必须覆盖：投降和断线超时的唯一结算、Redis 房间清理后 PostgreSQL 战绩保留、管理员接口鉴权和用户新增/重置/删除。

## 功能验收

- 单人：入门、简单、完整均可开始、猜测 8 次、正确/失败/放弃可结算。
- 联机：双人 BO1、在线匹配、6 位邀请码、准备、同时猜测、投降、断线 20 秒恢复/判负、结算后退出或再来一局。
- 对局页面：本人显示八个字段及颜色/箭头，对手只显示颜色进度；数字字段含义清楚。
- 账户：注册、登录、最近 3 局和单人/联机统计正确；联机公开排行榜继续显示“后续开放”。
- 目录：默认显示全部审核选手，搜索标准名、别名、队伍和赛区均有效。
- 后台：选手最新快照分页、审核、编辑、别名、禁用；用户分页、统计、新增、重置临时密码、删除和审计。

## 生产变量

ECS `.env.production` 至少包含：`DATABASE_URL`、`REDIS_URL`、`SESSION_SECRET`、`PASSWORD_PEPPER`、`INTERNAL_API_SECRET`、`RATE_LIMIT_PROXY_SECRET`、`CORS_ORIGIN`、`NODE_ENV=production`、`ADMIN_USERNAME`、`ADMIN_PASSWORD`、`ADMIN_SESSION_SECRET`。所有密钥使用随机值，不写入 Git。

## 发布与回滚

```bash
cd /opt/valo-yiba
git fetch origin main
git switch main
git pull --ff-only origin main
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
docker compose --env-file .env.production -f docker-compose.production.yml ps
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=200 api
```

发布后检查健康检查、首页、登录、单人、联机、后台和数据库记录。执行恢复验证时只使用：

```bash
docker compose --env-file .env.production -f docker-compose.production.yml restart
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

禁止 `docker compose down -v`、`git clean -fd` 和生产 `SEED_INITIAL_DATA=true`。回滚使用上一个已知可用 Git 提交重新构建镜像，不删除数据库卷。

## 已知后续优化

Redis 断线处理目前会扫描房间键；单人 active attempt 上限和证书自动续期仍需后续运维迭代。它们不阻塞当前小规模上线，但必须在扩大流量前单独处理。
