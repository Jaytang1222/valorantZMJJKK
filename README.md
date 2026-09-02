<div align="center">

# 康一把

**VALORANT 职业选手猜测游戏：单人挑战 + 双人实时对战**

[![CI](https://github.com/Jaytang1222/valorantZMJJKK/actions/workflows/ci.yml/badge.svg)](https://github.com/Jaytang1222/valorantZMJJKK/actions/workflows/ci.yml)
[![Node.js 22+](https://img.shields.io/badge/node.js-%E2%89%A522-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm workspaces](https://img.shields.io/badge/pnpm-workspaces-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/workspaces)

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?logo=next.js&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-000000?logo=fastify&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?logo=socketio&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-FF4438?logo=redis&logoColor=white)

[玩法](#玩法) · [功能特性](#功能特性) · [技术栈](#技术栈) · [快速开始](#快速开始) · [常用脚本](#常用脚本) · [单机容器部署](#单机容器部署可选) · [选手数据](#选手数据) · [项目结构](#项目结构) · [贡献](#贡献)

</div>

---

## 玩法

选择一个目标选手，在最多 **8 次猜测** 内从候选列表中猜出答案。每次猜测都会按以下八个字段返回比较结果：

**赛区 / 国籍 / 位置 / 当前或最近战队 / 状态 / 冠军赛冠军次数 / 大师赛冠军次数 / 联赛冠军次数**

- **绿色**：字段与答案一致
- **黄色**：字段接近，例如国籍属于同一地理分区
- **红色**：字段不一致
- **箭头**：数字字段提示答案更高或更低

答案、题目快照和计分均由服务端控制。题目使用冻结的选手快照，避免后台资料更新改变已经开始的对局。

## 功能特性

- **单人对战**：入门、简单、完整三档难度；每局 8 次猜测；支持注册用户保存战绩和游客试玩
- **双人联机**：在线匹配或创建私密房间；固定双人 BO1；6 位邀请码；每回合 5 分钟
- **实时对战**：双方可同时猜测；自己查看完整结果，对手只显示颜色和进度；投降胜者加 1 分
- **断线恢复**：用户断线后 20 秒内可重连原房，超时自动判负并完成结算
- **查选手**：默认显示全部已审核选手，支持标准名、别名、队伍和赛区搜索
- **个人账户**：显示最近 3 局详细战绩，以及单人/联机总局数、胜率和平均猜测数
- **管理员后台**：选手快照创建、编辑、审核、别名、禁用；用户分页、统计、新增、删除、密码重置和审计日志
- **邮箱密码认证**：注册后生成 `瓦友#xxxxxx` 默认显示名；游客使用临时显示名，不能自定义昵称或参与联机
- **中英文界面**：前端文案集中管理，API 使用统一错误响应
- **公开排行榜**：单人和联机公开排行榜按当前产品决策暂未开放，个人统计仍可用

## 技术栈

| 层         | 技术                                                          |
| ---------- | ------------------------------------------------------------- |
| 前端       | Next.js 15、React 19、TypeScript、Socket.IO Client、Sentry    |
| 后端       | Node.js 22、Fastify 5、Socket.IO、TypeScript、Sentry Node     |
| 数据库     | PostgreSQL、Drizzle ORM                                       |
| 缓存与实时 | Redis 7、Socket.IO Redis Adapter、分布式锁                    |
| 认证与校验 | HMAC 签名会话、Argon2id、Zod、HttpOnly Cookie                 |
| 测试       | Vitest、TypeScript 类型检查、Docker PostgreSQL/Redis 集成测试 |
| 包管理     | pnpm workspaces                                               |
| 生产部署   | 单机 Docker Compose、Nginx、HTTPS                             |

## 快速开始

**环境要求**：Node.js 22+、pnpm 10+、Docker Desktop（或 Docker Engine + Compose v2）。

```bash
pnpm install
node scripts/dev.mjs
```

`scripts/dev.mjs` 会在没有 `.env` 时创建本地开发配置和随机密钥，启动 PostgreSQL/Redis，执行迁移并运行 Web/API。已有 `.env` 不会被覆盖；如果缺少必需变量，脚本会直接提示。需要使用私有选手 CSV 时运行 `node scripts/dev.mjs --seed`。

本地 Compose 默认提供 `postgresql://valo:valo@localhost:5432/valo_yiba` 和 `redis://localhost:6379`。

访问 http://localhost:3000。API 地址为 http://localhost:3001，健康检查为 http://localhost:3001/health。

如果你在本地保留私有的 `data/players.seed.csv`，需要导入选手资料时再显式执行：

```powershell
pnpm db:seed
```

生产环境不会在容器启动时自动同步 CSV，后台修订以 PostgreSQL 中的最新审核快照为准。

### 运行时行为

- PostgreSQL 保存用户、选手快照、题目、单人战绩、联机回合、猜测和审计记录。
- Redis 保存联机房间临时状态、匹配队列、分布式锁、限流状态、缓存和可恢复定时任务。
- Redis 数据可以过期或被清理；已完成对局的权威记录已经写入 PostgreSQL，不依赖 Redis 保留。
- 生产必须保留 PASSWORD_PEPPER、SESSION_SECRET、INTERNAL_API_SECRET、RATE_LIMIT_PROXY_SECRET 等密钥，且不能提交到 Git。
- 生产 .env.production 不设置 SEED_INITIAL_DATA=true；容器启动只执行数据库迁移。

## 常用脚本

| 命令                                                                        | 说明                                |
| --------------------------------------------------------------------------- | ----------------------------------- |
| `pnpm dev`                                                                  | 同时启动 Web 和 API 开发服务        |
| `pnpm build`                                                                | 构建共享包、API 和 Web              |
| `pnpm lint`                                                                 | 执行各 workspace 的 TypeScript 检查 |
| `pnpm typecheck`                                                            | 执行完整类型检查                    |
| `pnpm test`                                                                 | 运行单元测试                        |
| `pnpm format:check`                                                         | 检查 Prettier 格式                  |
| `pnpm db:migrate`                                                           | 执行 Drizzle 数据库迁移             |
| `node scripts/dev.mjs`                                                      | 创建本地环境并启动 Web/API          |
| `node scripts/dev.mjs --seed`                                               | 创建本地服务并导入私有选手 CSV      |
| `bash scripts/deploy-single.sh`                                             | 构建、启动并检查单机生产服务        |
| `bash scripts/deploy-single.sh --update`                                    | 拉取 `main` 后构建、启动并检查服务  |
| `pnpm --filter @valo-yiba/api test:integration`                             | 运行 PostgreSQL/Redis 集成测试      |
| `pnpm --filter @valo-yiba/api smoke`                                        | API、数据库和公开选手接口冒烟检查   |
| `pnpm --filter @valo-yiba/api players:validate ../../data/players.seed.csv` | 校验选手 CSV                        |
| `pnpm --filter @valo-yiba/api load:versus`                                  | 运行受控双人房压测                  |

选手同步脚本位于 `apps/api/src/scripts/sync-*.ts`，默认读取本地私有 `data/` 路径，只用于人工审核前的数据维护，不应作为生产容器启动步骤自动执行。

## Redis 用途

<details>
<summary>展开查看</summary>

- 双人房间实时快照和 6 小时 TTL
- 在线匹配队列及取消匹配
- 房间锁、匹配锁和并发操作保护
- 回合超时、断线 20 秒判负和结束房间清理调度
- Socket.IO Redis Adapter 的跨进程广播
- API 限流和 Web 代理限流身份
- 个人/联机统计相关缓存

</details>

## 单机容器部署（可选）

项目支持在一台具备 Docker Engine 和 Compose v2 的 Linux 主机上运行完整服务。Compose 会启动 Web、API、Nginx、PostgreSQL 和 Redis；只有 Nginx 暴露公网端口，数据库与 Redis 保持在内部网络中。

以下步骤是通用的单机容器部署方法，不包含云厂商选择、域名备案、证书申请或任何特定平台的上线流程。

### 首次部署

1. 在服务器安装 Docker Engine、Compose v2 和 Git，并确认当前用户可以执行 `docker`。
2. 只从已合并的 `main` 分支取得代码：

   ```bash
   git clone --branch main --single-branch https://github.com/Jaytang1222/valorantZMJJKK.git
   cd valorantZMJJKK
   ```

3. 在仓库根目录创建 `.env.production`。该文件只保存在服务器，不提交 Git；至少配置：

   | 变量                                                                              | 用途                                                 |
   | --------------------------------------------------------------------------------- | ---------------------------------------------------- |
   | `POSTGRES_DB`、`POSTGRES_USER`、`POSTGRES_PASSWORD`                               | Compose 内部 PostgreSQL 账号                         |
   | `SESSION_SECRET`、`PASSWORD_PEPPER`、`INTERNAL_API_SECRET`                        | API 会话、密码和后台接口密钥（随机且至少 32 个字符） |
   | `RATE_LIMIT_PROXY_SECRET`                                                         | 生产限流代理签名密钥（随机且至少 32 个字符）         |
   | `CORS_ORIGIN`、`NEXT_PUBLIC_WS_URL`                                               | 对外 Web 来源和 Socket.IO 地址                       |
   | `USER_SESSION_SECRET`、`ADMIN_USERNAME`、`ADMIN_PASSWORD`、`ADMIN_SESSION_SECRET` | Web 会话和管理员后台                                 |

   `DATABASE_URL` 和 `REDIS_URL` 会由 `docker-compose.production.yml` 根据上述 Compose 服务自动注入；不要把公网数据库或 Redis 地址写入生产 Compose，除非你明确修改了 Compose 配置。

4. 配置 Nginx。当前仓库配置默认使用 HTTPS：将 `deploy/nginx/default.conf` 中的 `server_name` 和证书路径改为实际域名，并将证书放到对应的 `deploy/certbot/conf/live/<域名>/` 目录；证书目录只在服务器维护。没有域名或证书时，请先准备一份匹配实际访问方式的 Nginx 配置，再启动 `nginx` 服务。
5. 启动并执行数据库迁移：

   ```bash
   docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
   docker compose --env-file .env.production -f docker-compose.production.yml ps
   ```

   API 容器启动时只执行 Drizzle 迁移，不会自动用 CSV 覆盖已审核资料；生产环境不要设置 `SEED_INITIAL_DATA=true`。

也可以直接运行仓库内的单机部署脚本。脚本默认使用当前目录的 `.env.production`，启动前会检查必需变量、校验 Compose 配置，并在启动后检查 API 和 Nginx：

```bash
bash scripts/deploy-single.sh
```

### 更新与回滚

在同一目录执行以下命令更新到新的 `main`，或使用脚本的 `--update` 选项自动拉取并部署：

```bash
git fetch origin main
git switch main
git pull --ff-only origin main
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

```bash
bash scripts/deploy-single.sh --update
```

需要回滚时，将代码切换到已验证的旧提交后重复最后一条 Compose 命令。不要使用 `docker compose down -v`，否则会删除 PostgreSQL 和 Redis 数据卷。

### 启动后检查

```bash
docker compose --env-file .env.production -f docker-compose.production.yml ps
docker compose --env-file .env.production -f docker-compose.production.yml exec api \
  node -e "fetch('http://127.0.0.1:3001/health').then(async r => { console.log(await r.text()); process.exit(r.ok ? 0 : 1) })"
docker compose --env-file .env.production -f docker-compose.production.yml exec nginx nginx -t
```

随后从客户端检查首页、注册/登录、三档单人模式、双人匹配/私密房、查选手和 `/admin`。HTTPS 页面中的 Socket.IO 必须成功连接，不能出现混合内容错误。真实环境变量、数据库连接串、证书私钥、证书目录和用户数据均不得上传 GitHub。

领域规则和系统设计见 [spec/design.md](spec/design.md)；具体开发工作以仓库中的 issue 和 pull request 为准。

## 选手数据

`data/` 是本地私有的选手资料和来源台账目录，已加入 `.gitignore`，不会上传 GitHub，也不会进入 Docker 构建上下文。`data/players.seed.csv` 仅用于本地开发、校验和人工资料维护；生产公开数据以 PostgreSQL 中审核通过的最新选手快照为准。生产环境不自动用 CSV 覆盖后台修订，人工变更必须通过 `/admin` 建立新的快照并写入审计日志。

当前单人题库资格规则：

- **入门**：VCT CN 全部现役选手，以及其他赛区流量队伍的现役选手
- **简单**：数据库中的全部现役选手
- **完整**：数据库中的全部选手，包括历史选手

联机抽题使用服务端权重：入门 60%、简单 30%、完整 10%。每局题目在服务端冻结，客户端不会提前收到答案。

新增或纠正资料前应在私有台账中保留来源 URL、数据快照日期和核验日期；发现公开资料错误可在 GitHub Issues 提交。仓库不提供这份私有资料，贡献者应使用自己拥有或获准使用的数据。

## 项目结构

```text
apps/
├── api/
│   ├── drizzle/          # PostgreSQL 迁移 SQL 与 Drizzle 快照
│   └── src/
│       ├── routes/       # auth / players / solo / admin / health 等 REST 接口
│       ├── services/     # 题库、导入、房间状态、Redis 与统计服务
│       ├── scripts/      # 迁移、种子、数据同步、冒烟和压测脚本
│       └── realtime.ts   # Socket.IO 联机服务
├── web/
│   ├── app/              # 首页、单人、联机、选手目录、账户和管理端页面
│   └── lib/              # 会话、管理 API、限流代理和显示辅助函数
packages/
└── contracts/            # 前后端共享的 Zod/TypeScript 契约
scripts/
├── dev.mjs               # 跨平台本地开发启动与迁移脚本
└── deploy-single.sh      # Linux 单机生产部署与健康检查脚本
data/                     # 本地私有选手 CSV、规则文档和来源台账（不上传 Git）
deploy/nginx/             # 单机生产 Nginx 配置
spec/                     # 产品设计、开发和测试说明
```

## 贡献

- 提交 PR 前运行 pnpm format:check、pnpm lint、pnpm typecheck、pnpm test 和 pnpm build。
- 选手资料问题请在 [GitHub Issues](https://github.com/Jaytang1222/valorantZMJJKK/issues) 提交，附上可公开核验的来源。
- 不要提交 `.env`、生产环境变量、数据库连接串、证书私钥、构建产物、用户数据或私有 `data/` 内容。
