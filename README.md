# VALO 一把

VALORANT 职业选手身份猜测游戏。代码以 pnpm workspace 管理：Next.js Web、Fastify/Socket.IO API，以及共享领域 schema。

## 本地启动

1. 安装 Node.js 22+ 与 pnpm 10+。
2. 复制 `.env.example` 为 `.env`，替换两个本地 secret。
3. 运行 `docker compose up -d` 启动 PostgreSQL 和 Redis。
4. 运行 `pnpm install`、`pnpm db:migrate`、`pnpm db:seed`。
5. 运行 `pnpm dev`，Web 在 `http://localhost:3000`，API 健康检查在 `http://localhost:3001/health`。

## Railway 与 Vercel

- Railway API Service 的 Root Directory 保持仓库根目录，使用 `railway.toml` 指向 `apps/api/Dockerfile`；在同一环境引用 PostgreSQL 的 `DATABASE_URL` 与 Redis 的 `REDIS_URL`。
- 首次导入仓库内开发资料时，临时设 Railway API 的 `SEED_INITIAL_DATA=true` 并部署一次；导入成功后立即删除该变量。生产内容后续通过后台录入，不依赖部署种子。
- Vercel Root Directory 为 `apps/web`；设置 `NEXT_PUBLIC_API_BASE_URL`、`NEXT_PUBLIC_WS_URL`、`API_BASE_URL` 为 Railway API 的公共地址。
- 不要提交任何 Railway/Vercel token、数据库 URL 或 secret。
