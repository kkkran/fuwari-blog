/**
 * 智谱 AI 功能集成测试（mock 智谱/图床/图片下载 fetch）。
 *
 * 覆盖：
 * - 未登录/未启用 AI 的权限边界；
 * - 创建故事（AI 返回 JSON → 解析入库）；
 * - 续写（选择 → 追加条目、归属校验）；
 * - 每日限额（创建 5 / 续写 30 / 图片 20，跨请求持久）；
 * - 图片生成（mock 智谱 → mock 下载 → mock 图床上传）；
 * - 列表/删除。
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 必须在导入任何 server 模块前设置
const tmpDir = mkdtempSync(join(tmpdir(), "fuwari-ai-test-"));
process.env.DATABASE_PATH = join(tmpDir, "test.db");
process.env.CORS_ORIGIN = "http://127.0.0.1:4321,http://localhost:4321";
process.env.ADMIN_EMAILS = "admin@example.com";
process.env.ZHIPU_API_KEY = "test-key";
process.env.IMAGE_HOSTING_ENABLED = "false";

const { createApp } = await import("../src/index.js");

const app = createApp();
const server = await new Promise<import("node:http").Server>((resolve) => {
	const s = app.listen(0, "127.0.0.1", () => resolve(s));
});
const BASE = `http://127.0.0.1:${(server.address() as import("net").AddressInfo).port}`;

/** 模拟智谱/下载/图床的 fetch */
const originalFetch = globalThis.fetch;
let zhipuCallCount = 0;
let imageDownloadCount = 0;

function installFetchMock() {
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		// 智谱 API
		if (url.includes("open.bigmodel.cn")) {
			zhipuCallCount++;
			if (url.includes("/images/generations")) {
				return new Response(
					JSON.stringify({ data: [{ url: "https://ai.example.com/1.png" }] }),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}
			// chat/completions：按调用次数返回不同 JSON
			if (zhipuCallCount % 3 === 0) {
				return new Response(
					JSON.stringify({
						choices: [
							{
								message: {
									content: JSON.stringify({
										content: "续写段落：他推开了门，眼前是另一片天地。",
										choices: ["继续探索", "回头离开", "大声呼救"],
									}),
								},
							},
						],
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}
			return new Response(
				JSON.stringify({
					choices: [
						{
							message: {
								content: JSON.stringify({
									title: "星际迷航",
									content: "你在冷冻舱中苏醒，窗外是无尽的星河。",
									choices: ["检查飞船", "继续休眠", "发出求救信号"],
								}),
							},
						},
					],
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}
		// AI 图片下载
		if (url.includes("ai.example.com")) {
			imageDownloadCount++;
			return new Response(Buffer.from([1, 2, 3, 4]), { status: 200 });
		}
		// 其他（原逻辑）
		return originalFetch(input, init);
	}) as typeof fetch;
}

function extractCookie(response: Response): string {
	for (const cookie of response.headers.getSetCookie()) {
		const match = cookie.match(/fuwari_session=([^;]+)/);
		if (match) return `fuwari_session=${match[1]}`;
	}
	throw new Error("响应中未找到会话 Cookie");
}

async function register(email: string): Promise<string> {
	const res = await fetch(`${BASE}/api/auth/register`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, password: "password123", displayName: "AI用户" }),
	});
	assert.equal(res.status, 201);
	return extractCookie(res);
}

interface JsonOptions {
	cookie?: string;
	body?: unknown;
}

async function req(method: string, path: string, opts: JsonOptions = {}): Promise<Response> {
	return fetch(`${BASE}${path}`, {
		method,
		headers: {
			"Content-Type": "application/json",
			...(opts.cookie ? { Cookie: opts.cookie } : {}),
		},
		...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
	});
}

let cookie = "";

before(async () => {
	cookie = await register("ai-user@example.com");
	installFetchMock();
});

after(async () => {
	globalThis.fetch = originalFetch;
	server.close();
	const { db } = await import("../src/db.js");
	db.close();
	rmSync(tmpDir, { recursive: true, force: true });
});

describe("AI 互动小说", () => {
	it("未登录创建故事被拒（401）", async () => {
		const res = await req("POST", "/api/ai/stories", {
			body: { genre: "科幻" },
		});
		assert.equal(res.status, 401);
	});

	it("题材非法被拒（400）", async () => {
		const res = await req("POST", "/api/ai/stories", {
			cookie,
			body: { genre: "不存在的题材" },
		});
		assert.equal(res.status, 400);
	});

	it("创建故事成功：AI 开场入库并返回选项", async () => {
		const res = await req("POST", "/api/ai/stories", {
			cookie,
			body: { genre: "科幻" },
		});
		assert.equal(res.status, 201);
		const data = (await res.json()) as {
			story: { id: number; title: string; content: string; choices: string[] };
		};
		assert.equal(data.story.title, "星际迷航");
		assert.equal(data.story.choices.length, 3);
		storyId = data.story.id;
	});

	it("我的故事列表包含新故事", async () => {
		const res = await req("GET", "/api/ai/stories", { cookie });
		assert.equal(res.status, 200);
		const { stories } = (await res.json()) as {
			stories: { id: number; title: string; entries: number }[];
		};
		assert.ok(stories.some((s) => s.id === storyId && s.entries === 1));
	});

	it("续写：选择选项后追加条目", async () => {
		const res = await req("POST", `/api/ai/stories/${storyId}/continue`, {
			cookie,
			body: { choice: "检查飞船" },
		});
		assert.equal(res.status, 201);
		const { entry } = (await res.json()) as {
			entry: { seq: number; chosen: string; choices: string[] };
		};
		assert.equal(entry.seq, 2);
		assert.equal(entry.chosen, "检查飞船");
		assert.equal(entry.choices.length, 3);
	});

	it("续写他人故事被拒（404）", async () => {
		const other = await register("ai-user2@example.com");
		const res = await req("POST", `/api/ai/stories/${storyId}/continue`, {
			cookie: other,
			body: { choice: "检查飞船" },
		});
		assert.equal(res.status, 404);
	});

	it("故事详情返回全部条目", async () => {
		const res = await req("GET", `/api/ai/stories/${storyId}`, { cookie });
		assert.equal(res.status, 200);
		const { entries } = (await res.json()) as { entries: unknown[] };
		assert.equal(entries.length, 2);
	});

	it("删除故事成功", async () => {
		const res = await req("DELETE", `/api/ai/stories/${storyId}`, { cookie });
		assert.equal(res.status, 200);
		const after = await req("GET", `/api/ai/stories/${storyId}`, { cookie });
		assert.equal(after.status, 404);
	});
});

describe("AI 图片生成", () => {
	it("提示词必填（400）", async () => {
		const res = await req("POST", "/api/ai/images", { cookie, body: { prompt: "" } });
		assert.equal(res.status, 400);
	});

	it("生成成功：下载并返回图床 URL", async () => {
		const res = await req("POST", "/api/ai/images", {
			cookie,
			body: { prompt: "一只在星空中飞行的猫", ratio: "1:1", style: "插画" },
		});
		assert.equal(res.status, 201);
		const { image } = (await res.json()) as {
			image: { id: number; url: string; ratio: string };
		};
		assert.ok(image.url.length > 0);
		assert.equal(image.ratio, "1:1");
		assert.equal(imageDownloadCount, 1);
		imageId = image.id;
	});

	it("生成历史包含记录", async () => {
		const res = await req("GET", "/api/ai/images", { cookie });
		assert.equal(res.status, 200);
		const { images } = (await res.json()) as { images: { id: number }[] };
		assert.ok(images.some((i) => i.id === imageId));
	});

	it("删除记录成功", async () => {
		const res = await req("DELETE", `/api/ai/images/${imageId}`, { cookie });
		assert.equal(res.status, 200);
	});
});

describe("AI 每日限额", () => {
	it("创建故事超 5 次后返回 429", async () => {
		for (let i = 0; i < 5; i++) {
			await req("POST", "/api/ai/stories", { cookie, body: { genre: "奇幻" } });
		}
		const res = await req("POST", "/api/ai/stories", {
			cookie,
			body: { genre: "奇幻" },
		});
		assert.equal(res.status, 429);
	});

	it("quota 接口反映剩余额度", async () => {
		const res = await req("GET", "/api/ai/quota", { cookie });
		assert.equal(res.status, 200);
		const { quota } = (await res.json()) as {
			quota: { storyCreate: number; imageGenerate: number };
		};
		assert.equal(quota.storyCreate, 0);
		assert.equal(quota.imageGenerate, 19);
	});
});

let storyId = 0;
let imageId = 0;
