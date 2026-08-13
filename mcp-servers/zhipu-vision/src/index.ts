import { config as loadEnv } from "dotenv";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(PACKAGE_ROOT, ".env"), quiet: true });
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_KEY = process.env.ZHIPU_API_KEY;
if (!API_KEY) {
	console.error("错误：缺少环境变量 ZHIPU_API_KEY，请在 .env 中配置智谱 API Key");
	process.exit(1);
}

const BASE_URL = process.env.ZHIPU_BASE_URL ?? "https://open.bigmodel.cn/api/paas/v4";
const MODEL = process.env.ZHIPU_MODEL ?? "glm-4.6v-flash";
const REQUEST_TIMEOUT_MS = 120_000;

const MIME_TYPES: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".bmp": "image/bmp",
	".svg": "image/svg+xml",
	".pdf": "application/pdf",
	".txt": "text/plain",
	".md": "text/markdown",
	".json": "application/json",
	".csv": "text/csv",
	".mp4": "video/mp4",
	".mov": "video/quicktime",
	".avi": "video/x-msvideo",
	".webm": "video/webm",
};

function looksLikeUrl(value: string): boolean {
	return /^https?:\/\//i.test(value);
}

function isDataUri(value: string): boolean {
	return /^data:[^,]+;base64,/i.test(value) || /^data:[^,]+,/i.test(value);
}

function isRawBase64(value: string): boolean {
	return value.length >= 64 && value.length % 4 === 0 && /^[A-Za-z0-9+/=\s]+$/.test(value);
}

function looksLikeFilePath(value: string): boolean {
	return /[\\/]/.test(value) || /^[a-zA-Z]:/.test(value) || /\.[a-z0-9]{2,5}$/i.test(value);
}

async function resolveMediaUrl(value: string): Promise<string> {
	if (looksLikeUrl(value) || isDataUri(value)) {
		return value;
	}
	if (isRawBase64(value)) {
		return value;
	}
	if (looksLikeFilePath(value)) {
		const filePath = resolve(value);
		const ext = extname(filePath).toLowerCase();
		const mime = MIME_TYPES[ext] ?? "application/octet-stream";
		const data = await readFile(filePath);
		return `data:${mime};base64,${data.toString("base64")}`;
	}
	throw new Error(`无法识别的媒体输入：${value}（支持 http(s) URL、base64 或本地文件路径）`);
}

interface ChatMessage {
	role: "user";
	content: unknown[];
}

async function chatCompletion(
	contentParts: unknown[],
	prompt: string,
	thinking: string,
): Promise<string> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		const body: {
			model: string;
			messages: ChatMessage[];
			thinking?: { type: string };
		} = {
			model: MODEL,
			messages: [
				{
					role: "user",
					content: [...contentParts, { type: "text", text: prompt }],
				},
			],
		};
		if (thinking !== "auto") {
			body.thinking = { type: thinking };
		}

		const response = await fetch(`${BASE_URL}/chat/completions`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
			signal: controller.signal,
		});

		const data = (await response.json()) as {
			choices?: Array<{
				message?: { content?: string; reasoning_content?: string };
			}>;
			error?: { message?: string };
		};

		if (!response.ok) {
			throw new Error(
				`智谱 API 错误（HTTP ${response.status}）：${data.error?.message ?? JSON.stringify(data)}`,
			);
		}

		const message = data.choices?.[0]?.message;
		const reasoning = message?.reasoning_content
			? `【思考过程】\n${message.reasoning_content}\n\n`
			: "";
		const content = message?.content ?? "";
		if (!content && !reasoning) {
			throw new Error("智谱 API 返回了空结果");
		}
		return `${reasoning}${content}`;
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			throw new Error(`请求超时（${REQUEST_TIMEOUT_MS / 1000}s）`);
		}
		throw error;
	} finally {
		clearTimeout(timer);
	}
}

function textResult(text: string) {
	return { content: [{ type: "text" as const, text }] };
}

const thinkingSchema = z
	.enum(["enabled", "disabled", "auto"])
	.default("auto")
	.describe("深度思考模式：enabled 开启 / disabled 关闭 / auto 自动");

const server = new McpServer({
	name: "zhipu-vision",
	version: "1.0.0",
});

server.tool(
	"analyze_image",
	"使用智谱 GLM-4.6V-Flash 视觉模型分析单张图片，支持图片 URL、base64（含 data: URI）或本地文件路径",
	{
		image: z.string().describe("图片 URL、base64 数据或本地文件路径"),
		prompt: z
			.string()
			.default("请详细描述这张图片的内容。")
			.describe("对图片提出的问题或指令"),
		thinking: thinkingSchema,
	},
	async ({ image, prompt, thinking }) => {
		const url = await resolveMediaUrl(image);
		const text = await chatCompletion([{ type: "image_url", image_url: { url } }], prompt, thinking);
		return textResult(text);
	},
);

server.tool(
	"analyze_images",
	"使用智谱 GLM-4.6V-Flash 视觉模型同时分析多张图片，对比或综合多图信息",
	{
		images: z.array(z.string()).describe("图片列表（URL / base64 / 本地文件路径）"),
		prompt: z
			.string()
			.default("请详细描述这些图片的内容。")
			.describe("对图片提出的问题或指令"),
		thinking: thinkingSchema,
	},
	async ({ images, prompt, thinking }) => {
		const parts: unknown[] = [];
		for (const image of images) {
			const url = await resolveMediaUrl(image);
			parts.push({ type: "image_url", image_url: { url } });
		}
		const text = await chatCompletion(parts, prompt, thinking);
		return textResult(text);
	},
);

server.tool(
	"analyze_video",
	"使用智谱 GLM-4.6V-Flash 视觉模型理解视频内容，支持视频 URL 或本地视频文件路径",
	{
		video: z.string().describe("视频 URL 或本地视频文件路径"),
		prompt: z.string().default("请描述这个视频的内容。").describe("对视频提出的问题或指令"),
		thinking: thinkingSchema,
	},
	async ({ video, prompt, thinking }) => {
		const url = await resolveMediaUrl(video);
		const text = await chatCompletion([{ type: "video_url", video_url: { url } }], prompt, thinking);
		return textResult(text);
	},
);

server.tool(
	"analyze_file",
	"使用智谱 GLM-4.6V-Flash 视觉模型理解文档/文件（PDF、文本等），支持 URL 或本地文件路径",
	{
		file: z.string().describe("文件 URL 或本地文件路径（PDF/文本等）"),
		prompt: z.string().default("请总结这个文件的内容。").describe("对文件提出的问题或指令"),
		thinking: thinkingSchema,
	},
	async ({ file, prompt, thinking }) => {
		const url = await resolveMediaUrl(file);
		const text = await chatCompletion([{ type: "file_url", file_url: { url } }], prompt, thinking);
		return textResult(text);
	},
);

const transport = new StdioServerTransport();
await server.connect(transport);
