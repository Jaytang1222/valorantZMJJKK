# refine.md 实施与验收记录

本记录对应 `F:\Projects\valorant\spec\refine.md` 的实施结果。仅记录本地工作区的代码、测试和浏览器验收，不代表已经提交 Git、推送、合并或部署生产环境。

## 已实施

- 单人页面保留现有三档难度和九项公开字段，年龄固定为第三项；增加对局工具栏、猜测计数、颜色/箭头图例、桌面信息表和移动端字段标签。
- 联机页面继续使用原 Socket.IO 事件、房间状态机和计分逻辑；本人猜测使用紧凑三列/移动端两列布局，对手仅显示进度、状态和必要统计，并统一显示九项字段顺序。
- 规则入口使用 portal 弹窗，支持遮罩、关闭按钮、Escape 和焦点恢复；规则卡片解释完全一致、接近、不匹配和数值方向，并补充真实的单人、联机、游客和排行榜状态文案。
- 公开目录保持全量加载和客户端搜索；目录卡片详情弹窗显示与猜测一致的九项资料，并支持加载、错误、Escape、焦点恢复和移动端样式。
- 单人历史详情改为按 `guessedPlayerId` 读取最新已审核快照，避免未审核或禁用修订覆盖公开历史。
- 联机猜测改为只取最新已审核、启用且非教练的选手快照，保持公开资料隔离。
- `/admin` 选手状态视图、启用/禁用、年龄和角色编辑、用户管理、CSV 导出链路保持可用；CSV 代理不暴露内部密钥。
- 统一执行 Prettier，修复仓库原有格式阻断，使 `format:check` 可作为 CI 门槛运行。

## 自动验证证据

本地 Docker PostgreSQL/Redis 均为 healthy；执行了迁移后使用本地数据库和临时测试密钥运行：

```text
pnpm format:check       PASS
pnpm lint               PASS
pnpm typecheck          PASS
pnpm test               PASS (35 tests collected; 27 passed, 8 database tests skipped in this command)
pnpm build              PASS (API + Next.js)
pnpm --filter @valo-yiba/api test:integration PASS (8 tests)
```

数据库集成测试覆盖了管理员状态视图、启用/禁用、审核、年龄传递、CSV 导入/导出、公开字段隔离、认证、内部密钥和限流。另使用本地 `load:versus` 单房双账户验证了注册、实时凭据、Socket.IO 连接、建房、加入、准备、开始和投降，结果 `failures: []`。

## 浏览器验收

- `/`：规则弹窗在 `body` 下正确显示，关闭按钮、遮罩和规则卡片存在；控制台没有 hydration、error 或 warning。
- `/solo`：三档入口可见；四个赛区入口为禁用占位；开始入门对局后九项字段和底部搜索框可见。
- `/players`：本地数据库返回 1000 名公开选手；点击首张卡片后详情弹窗显示年龄、状态、位置、战队和三项赛事数据。
- `/admin`：登录入口、选手状态视图、CSV 下载和用户管理页面均可访问；CSV 下载事件成功。
- API `/health` 返回 database/redis `ok`；区域题库请求返回 `501`，不会创建题目或对局。

## 发布前仍需人工确认

1. 在目标设备上用 320px、375px、768px 宽度检查单人、联机、目录和 `/admin` 是否存在横向滚动；本轮代码已提供移动端两列/堆叠 CSS，但本地浏览器控制器未提供 viewport 覆盖接口。
2. 用两个真实本地账户在浏览器中完成匹配/私房、准备、猜测、断线 20 秒恢复、超时判负和刷新后的结算；自动 Socket 烟雾已覆盖建房至投降。
3. 在合并前由维护者复核生产环境变量、迁移备份和 ECS 回滚步骤；本轮没有连接或写入生产 PostgreSQL、Redis、ECS。

## Git 与部署边界

本轮未执行 `git commit`、`git push`、PR、生产迁移或部署。后续仍按 `feature/* -> staging -> PR -> main -> ECS` 流程推进。
