# 内容发布指南（demo 模板）

> 面向本站框架（Astro + Fuwari）的内容维护手册：从零新建一篇博客文章，并把它正确发布。
> 覆盖：文章文件位置、frontmatter 字段、正文语法、图片素材、发布与提交规范。

---

## 1. 文章放在哪

所有博客文章都是 Markdown 文件，放在：

```
src/content/posts/<文件名>.md
```

- 文件名即文章的 **slug（短链接）**：`src/content/posts/hello-world.md` 对应访问地址 `/posts/hello-world/`。
- 支持 `.md` 与 `.mdx` 两种格式。
- 建议 slug 用**英文小写 + 连字符**（如 `my-first-post.md`），与现有文章保持一致。
- 一篇文章 = 一个文件，无需注册、无需改任何配置。

---

## 2. 最小模板（直接复制）

```markdown
---
title: 我的第一篇文章
published: 2026-08-11T16:00:00
tags:
  - 教程
  - 随笔
description: 这篇文章用于演示如何填写 frontmatter 与使用各种语法
image: /public/assets/images/2026-08-11-cover.webp
draft: false
pinned: false
ai_level: 1
---

# 标题（可选，正文第一级标题）

这里是正文。使用标准的 Markdown 语法书写。

## 二级标题

段落、列表、代码块、表格、图片等都可以正常使用。
```

**只需 3 步：**

1. 在 `src/content/posts/` 下新建 `<slug>.md`；
2. 复制上面模板，填写 frontmatter（必填只有 `title` 和 `published`）；
3. 写正文，保存后在浏览器打开 `http://localhost:4321/posts/<slug>/` 预览。

---

## 3. frontmatter 字段速查

字段定义在 `src/content.config.ts`（Zod schema，字段不合法会直接构建报错）。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `title` | string | ✅ | — | 文章标题，会显示在列表与文章页 |
| `published` | 日期 | ✅ | — | 发布日期，见下方"日期格式" |
| `updated` | 日期 | 否 | 同 published | 更新日期，有实质修改时填写 |
| `draft` | boolean | 否 | `false` | `true` = 草稿（生产环境不显示，本地 dev 可见） |
| `description` | string | 否 | `""` | 摘要/SEO 描述 |
| `image` | string | 否 | `""` | 封面图路径，如 `/public/assets/images/xxx.webp` |
| `tags` | string[] | 否 | `[]` | 标签数组，会生成标签页与归档 |
| `lang` | string | 否 | `""` | 文章语言，默认留空即可 |
| `pinned` | boolean | 否 | `false` | `true` = 置顶文章 |
| `ai_level` | number | 否 | 无 | AI 参与度，取值 `1`/`2`/`3`，用于文章页标注 |
| `prevTitle` / `prevSlug` / `nextTitle` / `nextSlug` | string | 否 | `""` | **不要手动填**，由 `src/utils/content-utils.ts` 按排序自动生成前后篇 |

> 注意：schema 之外的字段（如 `category: 教程`）会被忽略、不会报错，但也不生效，不建议添加。

### 日期格式

支持以下两种写法（**不带时区**，内部按 UTC 存储，展示时自动转 Asia/Shanghai）：

```yaml
published: 2026-08-11            # 仅日期
published: 2026-08-11T16:00:00   # 日期 + 时间（更精确，推荐）
```

---

## 4. 正文语法速查

框架的 Markdown 管线（见 `astro.config.mjs`）在标准 GFM 之外还支持以下特性。

### 4.1 标准 Markdown

标题、粗体、斜体、删除线、行内代码、有序/无序/嵌套列表、任务列表、表格、引用、代码块（带语言高亮）、水平分隔线，全部直接可用。

````markdown
**粗体** *斜体* ~~删除线~~ `行内代码`

1. 有序列表
2. 第二项
   - 嵌套无序

- [x] 已完成
- [ ] 未完成

| 列 A | 列 B |
| --- | --- |
| 1 | 2 |

```ts
const greeting = "Hello";
```
````

### 4.2 GitHub 风格告警（推荐）

```markdown
> [!NOTE]
> 普通说明。

> [!TIP]
> 技巧提示。

> [!IMPORTANT]
> 重要信息。

> [!CAUTION]
> 小心操作，可能有副作用。

> [!WARNING]
> 警告，注意风险。
```

### 4.3 自定义告警（directive 语法）

```markdown
:::note
这是 note 告警。
:::

:::tip
这是 tip 告警。
:::

:::important
这是 important 告警。
:::

:::caution
这是 caution 告警。
:::

:::warning
这是 warning 告警。
:::
```

### 4.4 链接卡片

```markdown
:::github{repo="用户名/仓库名"}

:::url{href="https://example.com"}
```

会渲染成 GitHub 仓库卡片 / 链接卡片（`:::` 与 `{...}` 之间留一个空格，属性可用引号也可省略）。

### 4.5 数学公式（KaTeX）

```markdown
行内公式：$E = mc^2$

独立公式：
$$\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$$
```

### 4.6 图片

图片统一放在 `public/assets/images/` 目录，正文中用站点根相对路径引用：

```markdown
![](/public/assets/images/2026-08-11-cover.webp)

![带说明的图片](/public/assets/images/example.webp)
```

### 4.7 内部链接

```markdown
[站内文章链接](/posts/obsidian/)
[首页](/)
```

### 4.8 其他

- 外部链接渲染时自动 `target="_blank"` 新窗口打开。
- 各级标题自动生成锚点（`#` 链接），无需手动添加。
- 代码块内可正常使用 `||`、`:::` 等符号，不会被当作语法处理。

---

## 5. 一篇完整的 demo 文章

把下面内容保存为 `src/content/posts/demo-post.md` 即可直接预览（记得先放入一张图片或删掉 `image` 行）：

````markdown
---
title: 一篇覆盖全部语法的 Demo 文章
published: 2026-08-11T16:00:00
updated: 2026-08-12T10:30:00
tags:
  - 教程
  - Demo
description: 这篇文章用来演示本站文章的全部常用语法与 frontmatter 写法
image: /public/assets/images/2026-08-11-cover.webp
draft: false
pinned: false
ai_level: 2
---

> [!NOTE]
> 这篇文章是**模板示例**，你可以直接复制后改成自己的内容。

## 基本文本

**粗体**、*斜体*、~~删除线~~、`行内代码`，以及[站内链接](/posts/pin/)和[外部链接](https://example.com)。

## 列表

1. 第一步
2. 第二步
   - 嵌套项 A
   - 嵌套项 B

- [x] 已完成事项
- [ ] 待办事项

## 代码块

```bash
pnpm dev
```

```ts
const message: string = "Hello Fuwari";
console.log(message);
```

## 表格

| 语法 | 说明 |
| --- | --- |
| `> [!TIP]` | GitHub 风格告警 |
| `:::caution` | 自定义告警 |
| `:::github` | GitHub 仓库卡片 |

## 告警

> [!CAUTION]
> 部署前请先备份数据库。

:::warning
这是使用 directive 语法写的警告框。
:::

## 链接卡片

:::github{repo="saicaca/fuwari"}

:::url{href="https://astro.build"}

## 数学公式

质能方程：$E = mc^2$

$$
\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
$$

## 引用

> 这是普通引用块。

## 分隔线

---
````

---

## 6. 图片与素材

- 图片目录：`public/assets/images/`（封面、正文插图都放这里）。
- 引用方式：`![](/public/assets/images/xxx.webp)`。
- 本项目使用 `passthroughImageService`（原图直出，不二次压缩）。
- 清理图片/改写路径有专门脚本（`scripts/clean-unused-images.js`、`scripts/cdnify-images.js`），属于高风险操作：**执行前先确认扫描结果、保留可回滚版本**。

---

## 7. 草稿与发布

1. **预览**：`pnpm dev`，访问 `http://localhost:4321`。
2. **草稿**：`draft: true` 时生产环境不展示，本地开发可见；发布时改为 `false`。
3. **类型/格式检查**（可选）：`pnpm type-check`、`pnpm build`。
4. **提交**：提交信息必须使用简体中文；**发布新文章时，提交信息必须严格为**：

   ```
   posts:发布新文章《文章标题》。一句话说明。
   ```

   例：

   ```
   posts:发布新文章《内容发布指南》。介绍本站文章如何填写 frontmatter 与使用语法。
   ```

5. **推送**：推送远端前启用系统代理（`127.0.0.1:10808`）。

---

## 8. 公告（spec 集合）

站点公告放在 `src/content/spec/announcement.md`，frontmatter 只有两个字段：

```markdown
---
enable: true
level: tip
---

公告正文……
```

- `enable`：是否显示（默认 `true`）
- `level`：展示样式（如 `tip` / `info`，默认 `info`）

---

## 9. 常见问题（FAQ）

- **问：文件名可以用中文吗？**
  可以，但建议用英文 slug（与现有文章一致），避免链接编码问题。

- **问：改了文章内容需要改 `updated` 吗？**
  有实质性更新时建议补充 `updated` 字段。

- **问：为什么文章没有出现在列表里？**
  检查 `draft` 是否仍为 `true`；生产环境草稿会被过滤。

- **问：前后篇链接写哪里？**
  不用写。`prevTitle/prevSlug/nextTitle/nextSlug` 由代码按排序自动填充。

- **问：frontmatter 写错会怎样？**
  构建时会因 schema 校验失败直接报错，按报错提示修正即可；未知字段则被静默忽略。

- **问：发布后页面没更新？**
  本地确认 `pnpm dev` 正常、`pnpm build` 通过，再推送；Cloudflare Pages 等平台会监听仓库更新自动构建。
