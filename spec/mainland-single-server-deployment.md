# 中国大陆单服务器上线手册

更新时间：2026-08-27

本文覆盖本项目从 Railway/Vercel 生产环境迁移到阿里云 ECS 单服务器后的上线流程。目标是让中国大陆用户通过正式域名访问完整服务，并保留 Railway/Vercel 作为 staging 或回滚环境。

## 1. 架构与当前服务器

    用户浏览器 -> https://正式域名 -> Nginx
      /           -> web:3000  Next.js
      /api/...    -> Web 同源代理 -> api:3001
      /socket.io/ -> api:3001  Socket.IO

    ECS Docker Compose：web、api、postgres、redis、nginx

PostgreSQL 和 Redis 只在 Compose 内网访问，不开放 5432、6379；Web/API 也不直接开放 3000、3001。

当前服务器记录：

- 公网 IPv4：47.120.3.39
- SSH 用户：ecs-user
- 项目目录：/opt/valo-yiba
- 生产分支：main
- 数据卷：postgres_data、redis_data
- 规格：2 vCPU、4 GiB RAM、60 GiB SSD

## 2. 合并 main 后的五项收尾

### 2.1 同步 ECS 到最新 main

本地确认远程提交：

    git fetch origin main
    git rev-parse origin/main

服务器代码更新前必须：

1. 保留 /opt/valo-yiba/.env.production。
2. 保留 postgres_data 和 redis_data，禁止 docker compose down -v。
3. 不设置 SEED_INITIAL_DATA=true。生产启动只执行 Drizzle migration，不从 CSV 覆盖后台修改。
4. 确认工作树没有需要保留的服务器修改后，切换到 main 最新提交。若服务器无法通过 GitHub 拉取，可由部署者从本地上传已确认的源码归档；不要上传 .env.production、私钥或其他 secret。
5. 重建并检查容器：

   cd /opt/valo-yiba
   docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
   docker compose --env-file .env.production -f docker-compose.production.yml ps
   docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=100 api

当前 origin/main 已包含 PostgreSQL 18 Compose 修复（镜像和卷挂载路径调整），不会要求删除现有数据库卷。若代码版本不同，先停止本次发布并核对提交，不能用 down -v “解决”版本问题。

### 2.2 域名、实名认证和 ICP 备案

域名购买、实名认证、备案、DNS 控制台和证书申请必须由账号持有人操作。推荐在阿里云完成，ECS、域名、DNS、备案入口集中管理。

建议购买一个主域名，例如 valo-yiba.top 或 valo-yiba.online，Web 与 API 共用同一域名。单域名使浏览器只访问同源 /api 和 /socket.io，不需要跨域 Cookie，也只需要维护一张证书。top 通常首年和续费成本较低；online 也可用，最终以注册页的首年价、续费价、实名认证和转入限制为准。

流程：

1. 在阿里云万网搜索并购买 .top 或 .online 域名。
2. 完成域名实名认证，主体信息必须与备案主体一致。
3. 在阿里云备案系统将域名接入此 ECS，提交 ICP 备案。中国大陆服务器正式提供网站服务前应完成备案。
4. 备案审核期间可用 IP 做技术测试，但不要将 IP 作为正式推广入口。
5. 备案通过后添加 DNS：

   主机记录：@ 类型：A 记录值：47.120.3.39
   主机记录：www 类型：CNAME 记录值：@（可选）

6. 本地确认 DNS：

   Resolve-DnsName valo-yiba.top

### 2.3 HTTPS 与 Nginx

推荐使用 Let’s Encrypt 免费 DV 证书并自动续期；成本为 0，适合当前低流量项目。也可以使用阿里云免费/低价 DV 证书，但必须设置到期提醒或自动部署。

安全组最终规则：

- TCP 22：仅允许自己的管理 IP。
- TCP 80：允许公网，用于 HTTP 跳转和 ACME 验证。
- TCP 443：允许公网。
- 不开放 5432、6379、3000、3001。

Nginx 必须包含：

1. 80 将普通请求重定向到 https://$host$request_uri，ACME /.well-known/acme-challenge/ 除外。
2. 443 加载证书和私钥。
3. /socket.io/ 使用 HTTP/1.1，转发 Upgrade 和 Connection。
4. 上游只使用 Compose 服务名 web:3000、api:3001。

证书目录可以挂载为：

    /etc/letsencrypt:/etc/letsencrypt:ro
    /var/www/certbot:/var/www/certbot:ro

部署证书后检查：

    docker compose --env-file .env.production -f docker-compose.production.yml exec nginx nginx -t
    docker compose --env-file .env.production -f docker-compose.production.yml up -d nginx
    curl -I https://valo-yiba.top

### 2.4 生产变量与重建

编辑服务器 /opt/valo-yiba/.env.production，不得将内容发到聊天或提交 Git。至少确认：

    NODE_ENV=production
    POSTGRES_DB=...
    POSTGRES_USER=...
    POSTGRES_PASSWORD=...
    SESSION_SECRET=...
    PASSWORD_PEPPER=...
    INTERNAL_API_SECRET=...
    RATE_LIMIT_PROXY_SECRET=...
    USER_SESSION_SECRET=...
    ADMIN_USERNAME=...
    ADMIN_PASSWORD=...
    ADMIN_SESSION_SECRET=...
    CORS_ORIGIN=https://valo-yiba.top
    NEXT_PUBLIC_WS_URL=https://valo-yiba.top
    SEED_INITIAL_DATA 不设置或不是 true

NEXT_PUBLIC_WS_URL 在 Web 镜像构建阶段写入前端，因此变量改变后必须执行 up -d --build，只重启容器不够。生产的 RATE_LIMIT_PROXY_SECRET 只需在此 Compose 的 Web/API 之间一致，不要与 staging 共享，也不要使用示例值。

### 2.5 HTTPS 后验证与运维

按顺序验证：

1. https://valo-yiba.top 返回 200，无证书错误或 Mixed Content。
2. 注册、登录、刷新后仍保持登录，/api/auth/me 返回当前用户。
3. 游客单人入门、简单、完整三档均可开始、猜测、结算。
4. 注册用户的单人战绩和账户页可见。
5. 联机 Socket.IO 可连接，建房、加入、猜测、投降、断线恢复和结束返回正常。
6. /admin 可登录、查看和修改最新选手资料。
7. 查选手目录数量与迁移前一致。
8. 公网无法连接 5432、6379、3000、3001。
9. 重启 Docker/ECS 后五个容器自动恢复，数据库数据仍存在。

日常检查：

    docker compose --env-file .env.production -f docker-compose.production.yml ps
    docker stats --no-stream
    df -h

应配置磁盘、内存和容器异常告警，并定期查看 API 日志。当前已接受“不启用数据库备份”的风险；数据重要性提高后优先增加 PostgreSQL 备份。

## 3. 当前 HTTP IP 故障说明

生产 Web 在 apps/web/app/api/auth/[action]/route.ts 中将用户 Cookie 设置为 Secure。访问 http://47.120.3.39 时浏览器不会保存或发送该 Cookie，所以登录后刷新仍显示未登录。单人页面在 apps/web/app/solo/page.tsx 使用 crypto.randomUUID() 生成游客 ID；该 API 需要安全上下文（HTTPS，或本机 localhost），HTTP 公网 IP 可能在浏览器端直接失败。

公网三档单人创建接口已实测返回 201，故这两个现象不是 PostgreSQL、Redis 或题库故障。完成 HTTPS 并使用正式域名后，生产 Cookie 和游客 UUID 才能按设计工作。

## 4. Railway/Vercel 保留策略

Railway staging 和 Vercel Preview 继续用于开发回归，不迁移生产数据库，也不与 ECS 共享 PostgreSQL/Redis。确认 ECS 稳定后再决定是否释放原生产资源；释放前应再次确认数据库数据已在 ECS 上核对无误。

## 5. 必须由账号持有人完成的事项

- 购买域名并完成实名认证。
- 提交并完成 ICP 备案。
- 在 DNS 控制台添加 A/CNAME 记录。
- 在阿里云安全组开放 443，并限制 22 来源 IP。
- 申请或授权 TLS 证书并配置自动续期。
- 在服务器 .env.production 填写和核对生产 secret、域名变量。
- 完成 HTTPS 下的浏览器回归验证。

其余代码同步、镜像构建、迁移检查、Nginx 检查和容器健康检查可以由部署协作者执行，但任何 secret 只应由账号持有人在服务器控制台填写。
