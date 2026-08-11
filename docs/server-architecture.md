# 博客后端服务（`server/`）技术文档

> 适用版本：`server/package.json` v0.1.0。本文档描述博客自建账号 + GitHub OAuth 登录、
> 文章提交/审核/通知的后端实现，供维护与排障参考。

## 1. 概述

`server/` 是博客（`/blog/*` 页面）的后端服务，与 Astro 前端分离部署：

| 项 | 值 |
| --- | --- |
| 技术栈 | Node.js + Express 4 + TypeScript（ESM，`NodeNext`） |
| 数据库 | SQLite（`better-sqlite3`，WAL 模式） |
| 密码 | `bcryptjs`（成本因子 10） |
| 会话 | 随机 UUID token 存 `sessions` 表，HttpOnly Cookie 下发 |
| 文件上传 | `multer` 本地磁盘存储，仅图片（≤5MB） |
| 启动 | `pnpm dev`（tsx watch）/ `pnpm start` |
| 测试 | `pnpm test`（node:test + tsx，集成测试，见 §8） |

前端通过 `src/blog/api.ts`（`BLOG_API_BASE`）调用本服务；`credentials: "include"` 携带会话 Cookie。
**开发环境浏览器端**走 Astro dev 代理（`astro.config.mjs` `vite.server.proxy` 将 `/api`、`/uploads` 转发到 `http://127.0.0.1:3001`，`BLOG_API_BASE` 为空字符串、请求同源），
避免 `localhost:4321` 与 `127.0.0.1:3001` 跨站导致 `SameSite=Lax` 会话 Cookie 被浏览器拒绝设置/携带（登录态无法持久化）；
**SSR 端与生产环境**使用绝对地址（`serviceConfig.blogApiBaseUrl`）。

## 2. 目录结构与模块职责

```
server/
├── src/
│   ├── index.ts          # createApp()（应用装配：CORS/JSON/静态/路由/错误处理）+ 入口监听
│   ├── config.ts         # 全部配置集中读取（.env），含默认值
│   ├── db.ts             # SQLite 连接与建表（users/sessions/posts/notifications）
│   ├── types.ts          # User / PostRecord / PostDraft 等共享类型
│   ├── auth.ts           # /api/auth/* 注册/登录/登出/会话/GitHub OAuth
│   ├── users.ts          # 用户与会话数据访问层（查询/创建/密码校验/session CRUD）
│   ├── github.ts         # GitHub OAuth：state 生成/消费、授权 URL、code 换 token、用户信息
│   ├── middleware.ts     # getSessionToken / requireAuth / requireAdmin
│   ├── blog.ts           # /api/blog/* 投稿（提交/修改/我的/审核）
│   ├── public.ts         # /api/public/* 公开文章列表/详情（仅 approved）
│   ├── notifications.ts  # /api/notifications/* 未读数/列表/已读 + createNotification
│   └── upload.ts         # /api/upload 图片上传（multer，requireAuth）
├── test/auth.test.ts     # auth 集成测试（node:test）
├── data/fuwari.db        # SQLite 数据文件（git 忽略）
└── .env / .env.example   # 环境配置（.env 不入库）
```

**依赖方向**：`index.ts`（装配）→ 各 Router → `middleware.ts` / `users.ts` / `db.ts` / `config.ts`。
`users.ts` 是唯一数据访问层，Router 不直接触碰 SQL 之外的表细节（`blog.ts` 除外，见 §6 备注）。

## 3. 数据模型（SQLite）

```sql
users(id INTEGER PK, email TEXT UNIQUE NULL, password_hash TEXT NULL,
      display_name TEXT NOT NULL DEFAULT '', avatar_url TEXT NOT NULL DEFAULT '',
      github_id TEXT UNIQUE NULL, role TEXT CHECK(role IN ('user','admin')),
      created_at TEXT DEFAULT datetime('now'))
sessions(token TEXT PK, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         expires_at TEXT NOT NULL)
posts(id INTEGER PK, slug TEXT UNIQUE, title, description, image, tags TEXT JSON,
      content, status CHECK(status IN ('pending','approved','rejected')),
      author_id INTEGER NOT NULL REFERENCES users(id),
      reject_reason TEXT, created_at, updated_at, published_at TEXT NULL)
notifications(id INTEGER PK, user_id REFERENCES users(id) ON DELETE CASCADE,
              type TEXT DEFAULT 'review_result', message, read INTEGER DEFAULT 0,
              created_at TEXT DEFAULT datetime('now'))
```

要点：

- 账号来源两路：邮箱注册（`email + password_hash`）与 GitHub OAuth（`github_id`）；
  两者可并存于同一用户（OAuth 回调按 `github_id` 或邮箱匹配绑定）。
- `role` 由 `ADMIN_EMAILS` 决定：注册/GitHub 绑定时邮箱命中即为 `admin`。
- `posts.tags` 以 JSON 数组字符串存储，读取时容错解析。

## 4. 认证与授权

### 4.1 会话机制

1. `POST /api/auth/register` 或 `/login` 成功后 `createSession(userId)` 生成 `randomUUID()` token，
   写入 `sessions(expires_at = now + SESSION_TTL_DAYS)`。
2. `setSessionCookie`：`fuwari_session=<token>`，`HttpOnly`，`SameSite`/`Secure` 由环境变量控制，
   `Max-Age = SESSION_TTL_DAYS * 24h`。
3. 受保护接口经 `requireAuth`：`getSessionToken` 从 Cookie 取 token →
   `getSessionUser` 联表查询并校验 `julianday(expires_at) > julianday('now')`，
   顺带清理过期行；失败返回 401。
4. `POST /api/auth/logout` 删除 session 行并 `clearCookie`。

> 时间比较统一用 `julianday()`：历史数据 `expires_at` 为 ISO 8601（`...T10:33:05.410Z`），
> 与 `datetime('now')`（`2026-08-11 18:33:05`）直接字符串比较在同日内会失效
> （`'T' > ' '`），曾导致同日过期 session 仍可用、过期清理不生效（已修复，见 §7）。

### 4.2 邮箱规范化（2026-08 修复）

注册/登录入口统一 `normalizeEmail`：去首尾空格 + 转小写；数据层查询用
`lower(email) = ?`（兼容规范化前的存量数据）。因此：

- `  Bob@Example.com ` 与 `bob@example.com` 视为同一账号；
- 大小写不同的重复注册返回 409；
- 登录时大小写不敏感。

### 4.3 GitHub OAuth 流程

```
前端按钮 → GET /api/auth/github?redirect=…
  → generateOAuthState(redirect)（内存 Map，10 分钟过期，防 CSRF）
  → 302 GitHub authorize（scope: read:user user:email）
用户授权 → GET /api/auth/github/callback?code&state
  → consumeOAuthState(state)（单次消费；非法/过期 → 403）
  → exchangeCode(code) 换 access_token → GET /user 取 id/login/name/email/avatar
  → 按 github_id 匹配用户；否则按邮箱匹配；都没有则 createUser 新账号
  → updateUserGithub 绑定（email 为 NULL 时保留原值，COALESCE）
  → 创建会话 → 302 FRONTEND_BASE_URL + redirect
```

注意：`/user` 返回的 `email` 仅在用户公开邮箱时非空（`user:email` scope 下
未实现 `/user/emails` 拉取私有邮箱），GitHub 登录用户可能 `email = null`，
不影响登录，但无法命中 `ADMIN_EMAILS` 自动提权。

### 4.4 授权中间件

| 中间件 | 行为 |
| --- | --- |
| `requireAuth` | 无有效会话 → 401；否则 `req.user` 注入 |
| `requireAdmin` | 未登录 401；`role !== 'admin'` → 403 |

## 5. API 清单

统一前缀 `/api`；请求/响应均为 JSON；错误响应形如 `{ "error": "..." }`。

### 认证 `authRouter`（`/api/auth`）

| 方法与路径 | 鉴权 | 说明 |
| --- | --- | --- |
| `POST /register` | 公开 | `{email, password(≥8), displayName?}` → 201 `{user}` + Cookie；邮箱重复 409 |
| `POST /login` | 公开 | `{email, password}` → 200 `{user}` + Cookie；失败 401 |
| `POST /logout` | 公开 | 删 session + 清 Cookie → `{ok:true}` |
| `GET /session` | 公开 | `{user: User \| null}`（前端判断登录态） |
| `GET /providers` | 公开 | `{github: boolean}`（是否展示 GitHub 按钮） |
| `GET /github` | 公开 | OAuth 发起，302 到 GitHub |
| `GET /github/callback` | 公开 | OAuth 回调，失败 400/403，成功 302 回前端 |
| `GET /me` | `requireAuth` | `{user}`（调试/测试用） |

### 博客 `blogRouter`（`/api/blog`）

| 方法与路径 | 鉴权 | 说明 |
| --- | --- | --- |
| `POST /posts` | `requireAuth` | 提交文章（`status=pending`）；slug 冲突 409 |
| `PUT /posts/:id` | `requireAuth` | 作者本人修改，重置为 `pending` |
| `GET /my-posts` | `requireAuth` | 我的文章列表 |
| `GET /pending` | `requireAdmin` | 待审核列表 |
| `POST /:id/approve` | `requireAdmin` | 通过（写入 `published_at`，发通知） |
| `POST /:id/reject` | `requireAdmin` | 拒绝（`{reason}`，发通知） |

### 公开 `publicRouter`（`/api/public`）

| 方法与路径 | 说明 |
| --- | --- |
| `GET /posts?page&pageSize` | 已发布文章分页列表（含 `contentPreview`） |
| `GET /posts/:slug` | 已发布文章详情；不存在 404 |

### 通知 `notificationsRouter`（`/api/notifications`，均 `requireAuth`）

| 方法与路径 | 说明 |
| --- | --- |
| `GET /unread-count` | `{count}`（导航徽标轮询，60s） |
| `GET /` | 我的通知列表 |
| `POST /read` | `{ids?}`：指定 ids 或全部标记已读 |

### 上传 `uploadRouter`（`/api/upload`，`requireAuth`）

| 方法与路径 | 说明 |
| --- | --- |
| `POST /` | multipart `file`；仅图片扩展名 + `image/*` MIME，≤5MB；→ 201 `{url}` |

### 其他

| 方法与路径 | 说明 |
| --- | --- |
| `GET /api/health` | `{ok:true, name}` 探活 |
| `GET /uploads/*` | 上传文件静态服务（目录 `./data/uploads`） |

## 6. 配置项（`server/.env`，见 `.env.example`）

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `3001` | 监听端口 |
| `SESSION_COOKIE_NAME` | `fuwari_session` | 会话 Cookie 名 |
| `SESSION_TTL_DAYS` | `30` | 会话有效期（天） |
| `ADMIN_EMAILS` | `admin@example.com` | 逗号分隔；命中即 admin |
| `GITHUB_CLIENT_ID/SECRET/REDIRECT_URI` | 空 | 留空则隐藏 GitHub 登录 |
| `FRONTEND_BASE_URL` | `http://127.0.0.1:4321` | OAuth 回调落地页 |
| `CORS_ORIGIN` | `http://127.0.0.1:4321,http://localhost:4321` | 逗号分隔允许来源 |
| `COOKIE_SAME_SITE` | `lax` | `none` 时同 `COOKIE_SECURE=true` 用于跨站生产 |
| `COOKIE_SECURE` | `false` | 生产 HTTPS 必须 `true` |
| `DATABASE_PATH` | `./data/fuwari.db` | SQLite 文件路径 |

## 7. 历史 Bug 修复记录（2026-08）

| 问题 | 现象 | 修复 |
| --- | --- | --- |
| CORS 拒绝返回 500 | 来源不在白名单时错误处理中间件兜底成 `500 服务器内部错误`，前端无法定位；**且默认只放行 `127.0.0.1:4321`，从 Astro dev 默认地址 `localhost:4321` 访问时所有 API 请求失败 → 无法注册/登录** | CORS 错误映射为 `403 {error:"请求来源不被允许（CORS）"}`；默认来源增加 `http://localhost:4321`（`config.ts` + `.env` + `.env.example`） |
| session 同日过期失效 | `expires_at`（ISO 8601）与 `datetime('now')` 字符串比较，同日内 `'T' > ' '` 恒真，过期 session 仍可用；过期清理 SQL 永不生效 | 统一改用 `julianday(expires_at) > julianday('now')`，兼容新旧数据格式 |
| 邮箱大小写/空格敏感 | `Test@X.com` 与 `test@x.com` 可重复注册；登录大小写不匹配即 401 | 入口 `normalizeEmail`（trim+lowercase）；查询 `lower(email) = ?` 兼容存量数据 |
| 注册页 GitHub 按钮 404 | `RegisterPage.svelte` 链接为 `/api/auth/github`（未加 `BLOG_API_BASE`），点击请求到前端域名 | 与登录页一致补 `BLOG_API_BASE` 前缀 |
| Cookie 名双来源 | `middleware.ts` 直接读 `process.env.SESSION_COOKIE_NAME`，与 `config.sessionCookieName` 重复 | 统一走 `config` |

回归保障：`server/test/auth.test.ts`（`pnpm test`）覆盖注册/登录/会话/重复注册/密码错误、
CORS 放行与 403、同日过期 session、邮箱规范化。

## 8. 测试

```bash
cd server
pnpm test          # tsx --test test/*.test.ts，集成测试（临时 SQLite + 随机端口，不污染 data/）
pnpm type-check    # tsc --noEmit（src + test）
```

测试通过 `createApp()`（`index.ts` 导出，入口检测 `import.meta.url` 后才 listen）
自建临时端口与临时数据库，`after` 中关闭连接并清理。

## 9. 部署与运维注意

1. **CORS**：生产 `CORS_ORIGIN` 必须包含站点域名（如 `https://example.com`）；
   跨站部署（前端与 API 不同站点）还需 `COOKIE_SAME_SITE=none` + `COOKIE_SECURE=true`。
2. **前端地址**：构建时通过 `PUBLIC_BLOG_API_BASE_URL` 指向 API 根地址
   （`src/config.ts` 的 `serviceConfig.blogApiBaseUrl`；开发环境浏览器端 `src/blog/api.ts`
   的 `BLOG_API_BASE` 为空字符串走 Astro dev 同源代理，SSR 端仍为 `http://127.0.0.1:3001`）。
3. **Cookie 安全**：`HttpOnly` 已开；生产务必 `COOKIE_SECURE=true`。
4. **数据备份**：SQLite 单文件 + WAL，备份需同时处理 `-wal`/`-shm`（或用 `VACUUM INTO`）。

## 10. 已知风险与限制（暂未修复，评估后处理）

| 风险 | 说明 | 建议 |
| --- | --- | --- |
| OAuth state 存内存 | `github.ts` 的 `Map` 随进程重启/多实例失效，用户需重试 | 单实例可接受；多实例需 Redis/DB 存储 |
| 注册/登录无速率限制 | 可被暴力注册/撞库 | 生产前置网关限流或引入 `express-rate-limit` |
| 邮箱大小写折叠仅限 ASCII | SQLite `lower()` 对非 ASCII 邮箱不折叠 | 邮箱主流为 ASCII，可接受 |
| OAuth 绑定邮箱冲突 | GitHub 邮箱已被其他账号注册时 `email UNIQUE` 冲突 → 回调 500 | 回调前预检冲突并提示 |
| 上传目录与 DB 路径解耦 | `upload.ts`/`index.ts` 硬编码 `./data/uploads`，不随 `DATABASE_PATH` | 改为配置项 |
| SVG 上传 | 允许 `.svg`，存储型 XSS 风险（直接访问 URL 时） | 生产可关闭 SVG 或加 `Content-Security-Policy` / `X-Content-Type-Options` |
| 公开接口无缓存头 | `publicRouter` 未设 `Cache-Control` | 文章更新不频繁，可加缓存 |
| CSRF | 依赖 `SameSite=Lax` 防护管理操作 | 高安全要求时加 CSRF token |
| 注册开放 | 任何人可注册并发文（有 pending 审核兜底） | 需要时可加邀请码/邮箱验证 |
