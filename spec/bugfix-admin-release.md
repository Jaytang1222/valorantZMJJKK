# Bug 修复与管理端扩展实施规范

更新时间：2026-09-02

本文记录本轮上线前维护工作的范围、验收标准和发布流程。Railway 已取消，验证环境采用本地 Docker 与 GitHub CI，生产环境为阿里云 ECS Docker Compose。

## 1. 多人对战修复

### 1.1 猜测信息

双人对战中，自己的猜测必须展示八个字段的含义和结果。字段顺序固定为：

1. 赛区
2. 国籍
3. 位置
4. 当前/最近战队
5. 状态
6. 冠军赛冠军次数
7. 大师赛冠军次数
8. 联赛冠军次数

对手的猜测不泄露文字值，只展示对应字段的颜色、方向和数值比较结果；页面需要提供统一的字段图例，使颜色和箭头有明确含义。

### 1.2 准备状态

新加入房间或匹配完成时，按钮显示“准备”。只有当前用户已经点击准备后，按钮才显示“取消准备”；另一名用户的状态单独显示，避免把“对手已准备”误认为自己的状态。

### 1.3 超时和投降结算

对局超时必须原子地完成以下操作：

- 当前仍连接的另一方获胜并增加 1 分；
- 超时用户判负；
- 房间写入 `finished`、`time_expired`、获胜用户和结束时间；
- 双方刷新后仍能读取同一结算结果；
- 账号统计和最近战绩均包含该对局。

投降遵循相同的结算落库规则，获胜方增加 1 分，投降方判负。

### 1.4 统计口径

联机一局只统计一次：`rooms.finished_at` 非空且存在 `winner_user_id`。胜者为 `rooms.winner_user_id` 对应参与者，双方猜测数按 `guesses.room_round_id` 与用户分别统计。重复保存房间不能重复增加统计。

## 2. 管理端用户管理

管理端仅保留现有的单一 `admin` 管理员角色。用户管理页面必须支持：

- 分页或限量查看用户基本资料和单人/联机统计；
- 新增邮箱和密码用户，密码遵循现有强度规则并使用 `PASSWORD_PEPPER` 哈希；
- 将用户密码重置为固定临时密码 `123456`，并明确这是临时密码；
- 删除用户前二次确认；删除遵循数据库外键约束，不级联删除对局和审计历史；
- 所有新增、重置、删除操作写入 `admin_audit_logs`，不记录密码。

服务端管理 API 继续只接受内部 secret，Web 管理端先验证管理员会话。用户删除、密码重置和创建均不得开放给普通用户接口。

## 3. 项目整理边界

- 删除明确属于构建产物、临时产物或过时的未引用文档；
- 保留迁移 SQL、生产部署文件、当前数据源审计记录和仍被 CI/运行时引用的脚本；
- 不删除 `data/players.seed.csv`、Drizzle migration、`deploy/nginx` 或证书挂载目录；
- 不删除用户尚未确认的文件，仅整理已确认无运行用途的内容；
- README 保留安装、开发、测试、生产发布和数据维护的最小必要说明。

## 4. 验收与发布

本地必须通过：

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @valo-yiba/api test:integration
pnpm build
```

代码通过 PR 合并到 `main` 后，ECS 执行 `git pull --ff-only origin main` 和：

```text
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

禁止使用 `docker compose down -v`、`git clean -fd` 或启用 `SEED_INITIAL_DATA=true`。发布后必须检查五个容器、API 日志、正式域名、Socket.IO 和数据库数据量。最终执行一次受控 Docker 重启，确认容器和数据卷自动恢复。
