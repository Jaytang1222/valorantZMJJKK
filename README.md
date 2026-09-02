# 康一把

面向 VALORANT 社区的职业选手身份猜测游戏。项目包含单人三档难度、双人私密房/在线匹配、选手目录、个人战绩和管理员资料与用户管理。

## 技术栈

- Web：Next.js、React、TypeScript
- API：Fastify、Socket.IO、TypeScript
- 数据：PostgreSQL、Redis、Drizzle ORM
- 包管理：pnpm workspace
- 生产：阿里云 ECS + Docker Compose + Nginx

## 本地开发

环境要求：Node.js 22+、pnpm 10+、Docker Desktop。

```powershell
pnpm install
Copy-Item .env.example .env
docker compose up -d
pnpm db:migrate
pnpm dev
```

Web 默认地址为 `http://localhost:3000`，API 健康检查为 `http://localhost:3001/health`。本地需要导入资料时，显式运行 `pnpm db:seed`；生产容器只执行迁移，不自动同步 CSV。

## 检查与构建

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @valo-yiba/api test:integration
pnpm build
```

集成测试需要 Docker 中的 PostgreSQL/Redis，并设置 `RUN_DATABASE_TESTS=true` 与测试用 `PASSWORD_PEPPER`。

## 生产发布

生产目录为 ECS 上的 `/opt/valo-yiba`，通过 GitHub `main` 分支发布：

```bash
git pull --ff-only origin main
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

生产必须配置 `DATABASE_URL`、`REDIS_URL`、`SESSION_SECRET`、`PASSWORD_PEPPER`、`INTERNAL_API_SECRET`、`RATE_LIMIT_PROXY_SECRET`、`CORS_ORIGIN` 和管理员变量。不要设置 `SEED_INITIAL_DATA=true`，不要提交任何 secret、数据库连接串或证书私钥。禁止使用 `docker compose down -v`。

## 数据与后台

`data/players.seed.csv` 是受控资料源；公开资料以 PostgreSQL 中审核通过的最新快照为准。后台地址为 `/admin`，可管理选手快照、别名、禁用状态、用户、密码重置和账号统计。用户删除遵守数据库外键约束，已有历史对局的账号不会被静默级联删除。

## 部署回归

发布后依次检查 API 容器内 `/health`、首页 API 状态、选手目录、注册/登录、单人结算、双人匹配/断线恢复、`/admin` 和 Docker 重启后的数据恢复。详细清单见 `spec/mainland-single-server-deployment.md` 与 `spec/bugfix-admin-release.md`。
