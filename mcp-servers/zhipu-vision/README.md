# zhipu-vision-mcp

智谱 GLM-4.6V-Flash 视觉模型 MCP 服务器。通过 MCP 协议暴露智谱视觉模型能力，支持图片、多图、视频、文档理解。

## 功能

| 工具 | 说明 |
| --- | --- |
| `analyze_image` | 分析单张图片（URL / base64 / 本地文件路径） |
| `analyze_images` | 同时分析多张图片 |
| `analyze_video` | 理解视频内容（URL / 本地文件） |
| `analyze_file` | 理解文档（PDF / 文本等，URL / 本地文件） |

所有工具支持深度思考模式（`thinking` 参数：`enabled` / `disabled` / `auto`）。

## 环境要求

- Node.js >= 18
- 智谱开放平台 API Key（[open.bigmodel.cn](https://open.bigmodel.cn)）

## 安装与构建

```bash
pnpm install
cp .env.example .env  # 填入 ZHIPU_API_KEY
pnpm build
```

环境变量：

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `ZHIPU_API_KEY` | 是 | - | 智谱 API Key |
| `ZHIPU_MODEL` | 否 | `glm-4.6v-flash` | 模型名称 |
| `ZHIPU_BASE_URL` | 否 | `https://open.bigmodel.cn/api/paas/v4` | API 地址 |

## 本地验证

```bash
pnpm build
pnpm test:client
# 或指定图片与问题：
pnpm test:client "https://example.com/image.png" "图中有几只猫？"
```

## MCP 客户端配置

### Claude Desktop（claude_desktop_config.json）

```json
{
	"mcpServers": {
		"zhipu-vision": {
			"command": "node",
			"args": ["D:/my-boke/fuwari-blog/fuwari-blog/mcp-servers/zhipu-vision/dist/index.js"],
			"env": {
				"ZHIPU_API_KEY": "your-api-key"
			}
		}
	}
}
```

### opencode（opencode.json）

```json
{
	"mcp": {
		"zhipu-vision": {
			"type": "stdio",
			"command": "node",
			"args": ["D:/my-boke/fuwari-blog/fuwari-blog/mcp-servers/zhipu-vision/dist/index.js"],
			"env": {
				"ZHIPU_API_KEY": "your-api-key"
			}
		}
	}
}
```

> 若通过 `env` 传入 Key，可跳过 `.env` 配置；两者任选其一。

## 注意事项

- `.env` 已由根目录 `.gitignore` 忽略，不会入库。
- 本地文件路径支持相对/绝对路径，图片按扩展名自动推断 MIME 类型并转为 base64 上传。
- 请求超时 120 秒。
- 该模型为免费模型（视觉推理，9B），也支持工具调用与长上下文（128K）。
