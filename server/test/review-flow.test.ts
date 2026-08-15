/**
 * 审核发布全流程集成测试（bug 回归保护）
 *
 * 覆盖线上缺陷：文章审核通过后不显示在博客列表、点击查看显示"未找到"。
 * 流程：普通用户投稿（pending）→ 公开接口不可见 → 管理员通过 →
 * 公开列表与详情立即可见（published_at 已设置）。
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 必须在导入任何 server 模块前设置
const tmpDir = mkdtempSync(join(tmpdir(), "fuwari-review-test-"));
process.env.DATABASE_PATH = join(tmpDir, "test.db");
process.env.CORS_ORIGIN = "http://127.0.0.1:4321,http://localhost:4321";
process.env.ADMIN_EMAILS = "admin@example.com";

const { createApp } = await import("../src/index.js");

const app = createApp();
const server = await new Promise<import("node:http").Server>((resolve) => {
	const s = app.listen(0, "127.0.0.1", () => resolve(s));
});
const BASE = `http://127.0.0.1:${(server.address() as import("net").AddressInfo).port}`;

const SLUG = "review-flow-article";

function extractCookie(response: Response): string {
	for (const cookie of response.headers.getSetCookie()) {
		const match = cookie.match(/fuwari_session=([^;]+)/);
		if (match) return `fuwari_session=${match[1]}`;
	}
	throw new Error("响应中未找到会话 Cookie");
}

async function register(email: string, displayName: string): Promise<string> {
	const res = await fetch(`${BASE}/api/auth/register`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, password: "password123", displayName }),
	});
	assert.equal(res.status, 201, `注册 ${email} 应成功`);
	return extractCookie(res);
}

async function postJson(path: string, body: unknown, cookie = ""): Promise<Response> {
	return fetch(`${BASE}${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(cookie ? { Cookie: cookie } : {}),
		},
		body: JSON.stringify(body),
	});
}

let authorCookie = "";
let adminCookie = "";

before(async () => {
	authorCookie = await register("author@example.com", "作者");
	adminCookie = await register("admin@example.com", "管理员");
});

after(async () => {
	server.close();
	const { db } = await import("../src/db.js");
	db.close();
	rmSync(tmpDir, { recursive: true, force: true });
});

describe("审核发布全流程", () => {
	it("作者投稿成功，状态为 pending", async () => {
		const res = await postJson(
			"/api/blog/posts",
			{ title: "审核流程测试文章", slug: SLUG, content: "正文内容", tags: ["test"] },
			authorCookie,
		);
		assert.equal(res.status, 201);
		const { post } = (await res.json()) as { post: { status: string } };
		assert.equal(post.status, "pending");
	});

	it("审核前公开列表不包含该文章，详情返回 404", async () => {
		const list = (await (await fetch(`${BASE}/api/public/posts`)).json()) as {
			items: { slug: string }[];
		};
		assert.ok(!list.items.some((p) => p.slug === SLUG), "pending 文章不应出现在公开列表");
		const detail = await fetch(`${BASE}/api/public/posts/${SLUG}`);
		assert.equal(detail.status, 404);
	});

	it("管理员通过后，公开列表与详情立即可见且 published_at 已设置", async () => {
		const approve = await postJson(`/api/blog/posts/${SLUG}/approve`, {}, adminCookie);
		assert.equal(approve.status, 200);

		const list = (await (await fetch(`${BASE}/api/public/posts`)).json()) as {
			items: { slug: string; publishedAt: string | null }[];
		};
		const found = list.items.find((p) => p.slug === SLUG);
		assert.ok(found, "审核通过后文章应出现在公开列表");
		assert.ok(found.publishedAt, "审核通过后 published_at 必须已设置");

		const detailRes = await fetch(`${BASE}/api/public/posts/${SLUG}`);
		assert.equal(detailRes.status, 200, "审核通过后详情应可访问");
		const { post } = (await detailRes.json()) as {
			post: { status: string; publishedAt: string | null };
		};
		assert.equal(post.status, "approved");
		assert.ok(post.publishedAt);
	});

	it("非管理员无法通过审核", async () => {
		// 先提交一篇新文章，再让普通作者尝试通过
		await postJson(
			"/api/blog/posts",
			{ title: "另一篇文章", slug: "review-flow-second", content: "正文" },
			authorCookie,
		);
		const res = await postJson("/api/blog/posts/review-flow-second/approve", {}, authorCookie);
		assert.equal(res.status, 403);
	});
});
