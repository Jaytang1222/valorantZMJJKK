# 康一把

VALORANT 职业选手身份猜测游戏。代码以 pnpm workspace 管理：Next.js Web、Fastify/Socket.IO API，以及共享领域 schema。

## 本地启动

1. 安装 Node.js 22+ 与 pnpm 10+。
2. 复制 `.env.example` 为 `.env`，替换两个本地 secret。
3. 运行 `docker compose up -d` 启动 PostgreSQL 和 Redis。
4. 运行 `pnpm install`、`pnpm db:migrate`、`pnpm db:seed`。
5. 运行 `pnpm dev`，Web 在 `http://localhost:3000`，API 健康检查在 `http://localhost:3001/health`。

## Railway 与 Vercel

- Railway API Service 的 Root Directory 保持仓库根目录，使用 `railway.toml` 指向 `apps/api/Dockerfile`；在同一环境引用 PostgreSQL 的 `DATABASE_URL` 与 Redis 的 `REDIS_URL`。
- 生产 API 启动只执行数据库迁移，不会自动同步仓库 CSV。现有数据库内容保持不变，选手资料只有在管理员主动使用 `/admin` 的编辑或导入操作时才会更新。
- 本地需要导入开发资料时，在迁移完成后显式运行 `pnpm --filter @valo-yiba/api db:seed`；不要把 `SEED_INITIAL_DATA` 配置到 Railway 生产环境。
- 生产和 staging 需要在 Web 与 API 同时配置同一个随机的 `RATE_LIMIT_PROXY_SECRET`，用于隔离代理后的限流来源。
- Vercel Root Directory 为 `apps/web`；设置 `NEXT_PUBLIC_API_BASE_URL`、`NEXT_PUBLIC_WS_URL`、`API_BASE_URL` 为 Railway API 的公共地址。
- 不要提交任何 Railway/Vercel token、数据库 URL 或 secret。
