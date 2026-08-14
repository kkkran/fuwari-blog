# 世界树栈（Shijie's Nook）部署到 Cloudflare + R2 图床接入指南

> 适用仓库：`kkkran/fuwari-blog`（项目名 `shijies-nook`）
> 更新日期：2025-12
> 结论先行：**可以部署上线，但不是"一键直上"**——构建与部署配置均已验证可用，但图床 R2 接入、CORS、CI 凭据三件事必须先行，详见下文。

---

## 0. 结论速览（TL;DR）

| 项目 | 状态 | 说明 |
|---|---|---|
| `pnpm build` 本地构建 | ✅ 通过（约 1m22s，无报错） | 静态页 + SSR Worker 均产出 |
| `npx wrangler deploy --dry-run` | ✅ 通过 | 当前 `wrangler.jsonc` 配置有效，SESSION KV binding 由 adapter 自动托管，无缺 id 报错 |
| 部署目标 | ✅ 已就绪 | 项目已配置为 **Workers Static Assets**（非 Cloudflare Pages） |
| 博客后端 `api.miscoke.top` | ⚠️ 前提条件 | SSR 动态路由依赖它在线（VPS 保留），不在线则站点降级为纯 md 文章 |
| R2 图床 | ❌ 未接入 | 需要改 `server/` + `scripts/upimg.js`（本文第 3、5 章） |
| 部署 CI | ❌ 未配置 | 旧 `deploy.yml-nouse` 是静态部署且已禁用，需新建（本文第 4.4 节） |
| 自定义域名 | ✅ 前提已满足 | DNS 已在 Cloudflare，自定义域可一键接入 |

**你的决策记录**（本指南据此编写）：
- 部署目标：Workers Static Assets / Workers Builds（不用 Pages）
- 后端：VPS/Docker 保留在线，不迁移
- R2 范围：新图全走 R2（server 转发 + CLI 直传），旧图不动
- DNS 已在 Cloudflare；读者国内外都有（R2 直连 + 边缘缓存即可，后续可优化）

---

## 1. 为什么不是"Cloudflare Pages"

- Cloudflare 官方 2025 年已宣布 **Pages 与 Workers 统一**，Pages 进入维护模式，新功能只投给 Workers（Workers Static Assets / Workers Builds）。
- 本项目 `@astrojs/cloudflare@13.7.0` 的构建产物是 **Workers Static Assets 格式**（`dist/client` 静态资源 + `dist/server` Worker），v13 已不产出 Pages 需要的 `_worker.js` 格式。
- 坚持用 Pages 需要降级 adapter、走弃用路径，得不偿失。

**结论：你要的"Cloudflare 托管" = Workers Static Assets。** Git 集成部署（Workers Builds）体验与 Pages 几乎一致，见 4.4 / 4.5。

---

## 2. 架构现状盘点

```
浏览器 ──► miscoke.top（Cloudflare Workers：静态资源 dist/client + SSR Worker dist/server）
              │  ├─ 静态路由：/、/friends、/tools/**、/forum/**（SSG 产物）
              │  └─ 动态路由（prerender=false，运行时渲染）：
              │        /blog/[/page]、/posts/[slug]、/archive、/bangumi、
              │        /posts.json、/search.json、/rss.xml、/sitemap.xml、/timetable**
              │             │
              │             └──► fetch https://api.miscoke.top（4s 超时，失败降级纯 md）
              │                       ▲
              └──► VPS/Docker：Express + better-sqlite3（server/）
                     ├─ /api/public/* 公开查询、/api/auth/* 登录注册（GitHub OAuth）
                     ├─ /api/blog/* 投稿/审核、/api/notifications/*、/api/upload
                     ├─ /uploads/* 本地图片静态服务（回退存储）
                     └─ oneimg 图床（127.0.0.1:8080，Go 服务，旧图继续用）
```

- 动态路由共 **10 条** `prerender=false`（`src/pages` 下），SSR 时由 Worker 运行时 fetch 后端，4 秒超时、失败自动降级为纯 md 文章（`src/utils/blog-db.ts`）。
- 图床三条链路现状：① 本地写文章 `scripts/upimg.js` → oneimg；② 博客后端 `POST /api/upload` → oneimg、失败回退 `server/data/uploads` 本地磁盘；③ 历史文章里的旧图 URL（`p.miscoke.top`、cnb.cool CDN、oneimg 域名）。
- 外部子域服务：`t.`（统计）、`p.`（资源）、`u.`（Umami）、`i.`（论坛）、`e3.`（文件 API）、`icon.`、`b-live.`（在线状态），见 `src/config.ts`。

---

## 3. 需要改的地方（代码清单）

### 3.1 `wrangler.jsonc`（建议改，非阻塞）

```jsonc
{
  "name": "shijies-nook",          // ← 原为 "fuwari"，建议改成有意义的名称（Worker 名）
  "compatibility_date": "2025-08-11",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "./dist",
    "not_found_handling": "404-page",
    "binding": "ASSETS"
  },
  "main": "@astrojs/cloudflare/entrypoints/server"
}
```

- `SESSION` KV binding **无需手动声明**：adapter 构建时自动启用 Astro sessions（KV），首次 `wrangler deploy` 会自动创建同名 namespace（dry-run 已验证）。若你的账号禁止自动创建，再手动建 KV namespace 并在 `kv_namespaces` 里显式声明 id。
- **不要手动改 `dist/`**：`dist/client` + `dist/server` 是构建产物，实际部署清单是插件生成的 `dist/server/wrangler.json`（assets 指向 `../client`）。
- 图床上传走 server（Node），**不需要**给 Worker 加 R2 binding。

### 3.2 `server/`（必改：R2 上传）

1. 新增依赖：`pnpm --dir server add @aws-sdk/client-s3`
2. `server/.env.example` / `server/.env` 新增（见第 5.4 节变量表）
3. `server/src/config.ts`：解析 `IMAGE_HOSTING_TYPE=r2` 及 `R2_*` 配置
4. `server/src/image-hosting.ts`：新增 R2 上传分支（代码示意见 5.2），**保留失败回退本地磁盘**的现有语义
5. `server/src/index.ts` 的 CORS：`CORS_ORIGIN` 必须加入生产域名，否则浏览器登录/上传直接 403：

```
CORS_ORIGIN=http://127.0.0.1:4321,http://localhost:4321,https://miscoke.top,https://*.miscoke.top
```

> ⚠️ 部署上线**之前**先在 VPS 上改好 CORS 并重启 server，否则新域名下登录/投稿/上传全部失败。

### 3.3 `scripts/upimg.js`（必改：CLI 直传 R2）

- 支持双模式：检测到 `R2_*` 环境变量时走 R2（S3 PutObject），否则回退 oneimg（`ONEIMG_*`），保持现有"一键上传 + 复制 Markdown 引用"体验。
- 要点见 5.3。改完后记得按仓库约定（AGENTS.md）单独提交，提交信息用简体中文。

### 3.4 部署 CI（必做：新建 `.github/workflows/deploy.yml`）

完整内容见第 4.4 节。旧 `.github/workflows/deploy.yml-nouse`（静态部署到 `page` 分支）与当前 SSR 架构不匹配，**不要重新启用**，建议直接删除。

### 3.5 `src/config.ts`（确认，无需改）

- `blogApiBaseUrl` 生产默认已指向 `https://api.miscoke.top` ✅（如需 CI 覆盖可用 `PUBLIC_BLOG_API_BASE_URL`）
- `assetsBaseUrl` 指向 `p.miscoke.top`，若该域要复用为 R2 自定义域，注意它目前承载资源/图床服务，建议**新开子域**（如 `img.miscoke.top`）挂 R2，避免动现有服务。

---

## 4. 部署操作步骤

### 4.1 一次性准备（Cloudflare 控制台，约 10 分钟）

1. **API Token（CI 用）**：`My Profile → API Tokens → Create Token`，选模板 "Edit Cloudflare Workers"，权限补上：
   - `Workers Scripts: Edit`
   - `Workers KV Storage: Edit`
   - `Account Settings: Read`（可选）
   记下 Token（只显示一次），后续存到 GitHub Secrets。
2. **R2 Bucket**：`R2 → Create bucket`，名称如 `shijies-images`，位置选 `APAC` 或 `auto`。
3. **R2 自定义域**：bucket → `Settings → Custom Domains → Connect Domain`，填 `img.miscoke.top`（DNS 在 Cloudflare，自动建 CNAME）。备用：临时可用 `r2.dev` 子域（Settings 里开启 Public Access）。
4. **R2 API Token**：`R2 → Manage R2 API Tokens → Create API Token`，权限 `Object Read & Write`。生成 `Access Key ID` + `Secret Access Key`。
5. **workers.dev 子域**（可选）：`Workers & Pages → Your subdomain`，设置一次账号级 `xxx.workers.dev`，用于部署后快速验证。

### 4.2 本地首次部署（验证用）

```powershell
pnpm install
pnpm build
npx wrangler login        # 或设置 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID 环境变量
npx wrangler deploy
```

- 首次部署自动创建 `SESSION` KV namespace；产物约 15.3MB（gzip 3.1MB）/ 1487 个文件，远低于 Worker 限制。
- 部署后访问 `https://<worker-name>.<your-subdomain>.workers.dev` 验证。

### 4.3 自定义域名接入（正式上线动作）

- Worker → `Settings → Domains & Routes → Add → Custom Domain`：填 `miscoke.top`。
- DNS 已在 Cloudflare：自动创建 CNAME `miscoke.top → worker`，**添加即切换流量**（原站点下线），请先完成 4.2 验证 + 第 6 章验证清单再操作。
- `api.miscoke.top` 保持现有指向 VPS 的记录，**不要动**。

### 4.4 GitHub Actions 自动部署（推荐）

新建 `.github/workflows/deploy.yml`：

```yaml
name: 部署到 Cloudflare Workers
on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0        # 必须：update-diff.js 用 git log --follow 生成文章历史，浅克隆会得到空历史
      - uses: pnpm/action-setup@v4
        with:
          version: 9.14.4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - name: 部署
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy
```

GitHub Secrets 两个：
- `CLOUDFLARE_API_TOKEN`（4.1 步骤 1 创建）
- `CLOUDFLARE_ACCOUNT_ID`（dashboard 右下角 Account ID）

### 4.5 Workers Builds（面板式 Git 集成，可选替代）

- Workers & Pages → `Create → Workers → Create Worker`（或直接对现有 Worker）→ `Settings → Builds`，连接 GitHub 仓库，构建命令 `pnpm build`，输出目录 `dist`。
- 需要绑定 `SESSION` KV：`Settings → Bindings → KV Namespace`（自动创建的 `SESSION` namespace）。
- 注意：Builds 与 vite-plugin 的产物目录约定偶有坑（`dist/client` + `dist/server` 双目录），**优先用 4.4 的 GitHub Actions**，Builds 作为备选。

---

## 5. R2 图床接入方案

### 5.1 总体设计

| 维度 | 方案 |
|---|---|
| 写入 | 私有：server（S3 API）转发 + 本地 CLI（S3 API）直传 |
| 读取 | 公开：R2 自定义域 `img.miscoke.top` → Cloudflare 全球边缘缓存 |
| 兜底 | R2 上传失败 → 回退 `server/data/uploads` 本地磁盘（沿用现有语义） |
| 旧图 | 不动：oneimg 继续在 VPS 运行，旧 URL 保持不变 |
| 成本 | R2 免费额度：10GB 存储 + A 类操作 100 万次/月 + B 类 1000 万次/月（以官方价格页为准） |

### 5.2 `server/src/image-hosting.ts` 新增 R2 分支（示意）

```ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${config.imageHosting.r2AccountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.imageHosting.r2AccessKeyId,
    secretAccessKey: config.imageHosting.r2SecretAccessKey,
  },
});

async function uploadToR2(file: UploadableFile): Promise<ImageHostingResult | null> {
  try {
    const ext = extname(file.originalname).toLowerCase();
    const key = `${new Date().toISOString().slice(0, 7).replace("-", "/")}/${randomUUID()}${ext}`;
    await s3.send(new PutObjectCommand({
      Bucket: config.imageHosting.r2Bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }));
    return { url: `${config.imageHosting.r2PublicBaseUrl}/${key}` };
  } catch (error) {
    console.error("R2 上传失败：", error);
    return null; // 调用方回退本地磁盘
  }
}
```

- `uploadToImageHosting()` 入口改为按 `config.imageHosting.type` 分发：`"r2" → uploadToR2`，`"oneimg" → 现有逻辑`；两者失败都返回 `null` 走回退。
- `@aws-sdk/client-s3` 是纯 JS，跑在 Node 的 VPS 上没问题（不要试图把 server 搬进 Worker）。

### 5.3 `scripts/upimg.js` 改造要点

- 检测 `process.env.R2_ACCOUNT_ID` 存在 → R2 模式：`PutObjectCommand` 直传，输出 `![](https://img.miscoke.top/<key>)` 并复制剪贴板（复用现有 `toMarkdownImage`/剪贴板逻辑）。
- 否则保持 oneimg 模式（`ONEIMG_*`），向后兼容。
- 建议新建 `scripts/lib/r2-client.js`，与 server 共用同一套 key 命名规则（按月分目录 + UUID）。

### 5.4 环境变量清单

**server/.env（VPS）新增：**

```ini
# 图床类型：r2 | oneimg（默认 oneimg 兼容旧配置）
IMAGE_HOSTING_TYPE=r2
# R2 凭证（R2 → Manage R2 API Tokens 生成）
R2_ACCOUNT_ID=你的账号ID
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=shijies-images
# R2 公开访问基址（自定义域，末尾不要带 /）
R2_PUBLIC_BASE_URL=https://img.miscoke.top
```

**本地 CLI（upimg.js）**：同样一组 `R2_*` 环境变量（可放用户级 `.env` 或 shell 配置）。

**CI / Cloudflare 侧**：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`（见 4.4）。构建与运行**不需要** `GEMINI_API_KEY`（`ai-summary` 是本地手动脚本），不要把 Gemini 密钥放进 CI。

---

## 6. 上线验证清单

部署后逐项过（建议先 `.workers.dev` 域名过一遍，再切自定义域）：

- [ ] `https://<worker>.workers.dev/` 首页正常
- [ ] `/blog/` 列表同时含 md 文章与 DB 文章（后端在线时）；后端故意停掉时应能降级显示 md 文章
- [ ] `/posts/<一篇db文章的slug>/` 详情可渲染（Markdown 插件、KaTeX、admonition）
- [ ] `/search.json`、`/posts.json`、`/rss.xml`、`/sitemap.xml`、`/robots.txt` 返回 200
- [ ] `/404.html`：随便访问一个不存在路径返回自定义 404
- [ ] 登录/注册/投稿/后台审核全流程（验证 CORS 已加新域名、Cookie 会话正常）
- [ ] 上传一张图：返回的 URL 为 `https://img.miscoke.top/...` 且公网可访问、Content-Type 正确
- [ ] `pnpm upimg <图>` CLI 上传成功并复制 Markdown 引用
- [ ] 旧图（oneimg、`p.miscoke.top`、cnb.cool）全部正常加载
- [ ] 国内/海外各测一次首页与图片加载（海外应很快；国内一般，见风险 7.4）
- [ ] 首页统计（`t.miscoke.top` tracker）、Umami（`u.miscoke.top`）、论坛链接（`i.miscoke.top`）正常

---

## 7. 风险与注意事项

1. **Pages 弃用**：不要新建 Pages 项目；现有思路全部按 Workers 走，后续 Cloudflare 新特性（版本回滚、渐进部署、Bindings 管理）都在 Workers 侧。
2. **构建依赖 git 历史**：`pnpm build` 内置 `update-diff.js`（生成 `src/json/git-history.json`），CI 必须 `fetch-depth: 0`，否则文章历史功能为空（构建不报错，属静默降级）。
3. **KV 免费额度**：Astro sessions 默认启用 `SESSION` KV binding，但当前代码未实际使用 `Astro.session`（登录态在后端 Cookie），KV 读写 ≈ 0，免费额度（10 万读/天，以官方为准）无压力。若未来前端会话量上来，注意 KV 写限额（1 千/天）。
4. **国内访问**：R2 自定义域走 Cloudflare 边缘，大陆直连速度一般（时好时坏）。当前方案先直连；后续可优化：R2 存储 + 前置国内 CDN（回源 `img.miscoke.top`），或 Cloudflare 自选 IP。文档不展开，需要时再出专项方案。
5. **不要跑 `build:cdn`**：`scripts/cdnify-images.js` 会把 `public/assets` 图片批量改写为 cnb.cool 外链并删除本地目录（高风险脚本），生产 CI 只用 `pnpm build`。
6. **Worker 体积**：当前产物 gzip 3.1MB，远低于 10MB 上限；`onig.wasm`（语法高亮）455KB 已含。后续注意别引入大依赖。
7. **回滚**：Cloudflare 控制台 Worker → `Deployments` 可回滚到历史版本；KV/R2 数据不可随代码回滚，改上传逻辑前先验证。
8. **上传限制**：multer 5MB 上限不变；R2 单对象上限 5GB，无需调整。
9. **`.wrangler`/`dist` 不入库**（已 gitignore），CI 内重新构建，无需处理。

---

## 8. 执行顺序（建议排期）

| 步骤 | 内容 | 预估 |
|---|---|---|
| 1 | Cloudflare 控制台：API Token、R2 bucket、自定义域、workers.dev 子域 | 10 分钟 |
| 2 | server 改造：S3 依赖 + R2 上传分支 + CORS + 环境变量，本地测试上传/回退 | 1~2 小时 |
| 3 | `scripts/upimg.js` R2 模式 + 本地验证 | 30 分钟 |
| 4 | `wrangler.jsonc` 改名 + `pnpm build` + `wrangler deploy --dry-run` 复验 | 10 分钟 |
| 5 | `.workers.dev` 全量验证（第 6 章清单） | 30 分钟 |
| 6 | 写 GitHub Actions + secrets，push 触发自动部署 | 30 分钟 |
| 7 | 添加自定义域 `miscoke.top`（切流量），再次全量验证 | 10 分钟 |
| 8 | 删除 `deploy.yml-nouse`，清理旧流程 | 5 分钟 |
