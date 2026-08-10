# 世界树栈（Shijie’s Nook）

世界树栈是一个基于 Astro、TypeScript 与 Svelte 构建的个人知识栈，用于发布技术写作、AI 工作流、工具实验、论坛互动和长期维护的数字生活记录。

## 本地开发

```powershell
pnpm install
pnpm dev
```

## 常用命令

```powershell
pnpm build
pnpm type-check
pnpm format
pnpm lint
```

## 域名配置

站点主域和服务子域集中在 `src/config.ts`：

- 主站：`miscoke.top`
- 访问统计：`t.miscoke.top`
- 图片资源：`p.miscoke.top`
- Umami：`u.miscoke.top`
- 论坛 API：`i.miscoke.top`
- 文件 API：`e3.miscoke.top`
- 链接元数据：`icon.miscoke.top`

后续更换域名时，优先修改 `src/config.ts` 中的 `customDomain` 与 `serviceDomains`。

## 验证

仓库当前未定义标准测试脚本。改动后建议至少运行：

```powershell
pnpm type-check
pnpm build
```
