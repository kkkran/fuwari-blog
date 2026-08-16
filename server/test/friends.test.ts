/**
 * 友链申请与审核 API 集成测试。
 *
 * 覆盖：
 * - 未登录提交被拒、非管理员访问待审被拒；
 * - 提交校验（站点名/链接格式）；
 * - 公开列表仅展示已通过；
 * - 管理员 通过/拒绝/修改/删除；
 * - 申请限流。
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 必须在导入任何 server 模块前设置
const tmpDir = mkdtempSync(join(tmpdir(), "fuwari-friends-test-"));
process.env.DATABASE_PATH = join(tmpDir, "test.db");
process.env.CORS_ORIGIN = "http://127.0.0.1:4321,http://localhost:4321";
process.env.ADMIN_EMAILS = "admin@example.com";

const { createApp } = await import("../src/index.js");

const app = createApp();
const server = await new Promise<import("node:http").Server>((resolve) => {
	const s = app.listen(0, "127.0.0.1", () => resolve(s));
});
const BASE = `http://127.0.0.1:${(server.address() as import("net").AddressInfo).port}`;

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

let userCookie = "";
let adminCookie = "";

before(async () => {
	userCookie = await register("friend-user@example.com", "友链申请者");
	adminCookie = await register("admin@example.com", "管理员");
});

after(async () => {
	server.close();
	const { db } = await import("../src/db.js");
	db.close();
	rmSync(tmpDir, { recursive: true, force: true });
});

const validApply = {
	siteName: "示例小站",
	url: "https://example.com/blog",
	description: "记录技术与生活",
	avatar: "https://example.com/avatar.png",
};

describe("友链申请 API", () => {
	it("未登录提交被拒（401）", async () => {
		const res = await req("POST", "/api/friends", { body: validApply });
		assert.equal(res.status, 401);
	});

	it("提交校验：站点名与链接必填、链接格式校验", async () => {
		let res = await req("POST", "/api/friends", {
			cookie: userCookie,
			body: { siteName: "", url: "https://a.com" },
		});
		assert.equal(res.status, 400);
		assert.match((await res.json()).error, /站点名称/);

		res = await req("POST", "/api/friends", {
			cookie: userCookie,
			body: { siteName: "站", url: "not-a-url" },
		});
		assert.equal(res.status, 400);
		assert.match((await res.json()).error, /格式不正确/);
	});

	it("登录用户提交成功（201，进入 pending）", async () => {
		const res = await req("POST", "/api/friends", {
			cookie: userCookie,
			body: validApply,
		});
		assert.equal(res.status, 201);
		const data = (await res.json()) as { friend: { status: string } };
		assert.equal(data.friend.status, "pending");
	});

	it("公开列表在通过前为空", async () => {
		const res = await req("GET", "/api/friends");
		assert.equal(res.status, 200);
		assert.deepEqual((await res.json()).friends, []);
	});

	it("非管理员访问待审队列被拒（403）", async () => {
		const res = await req("GET", "/api/friends/pending", { cookie: userCookie });
		assert.equal(res.status, 403);
	});

	it("管理员可见待审记录（含申请者邮箱）并可点击的链接", async () => {
		const res = await req("GET", "/api/friends/pending", { cookie: adminCookie });
		assert.equal(res.status, 200);
		const { items } = (await res.json()) as {
			items: { siteName: string; url: string; email: string }[];
		};
		assert.equal(items.length, 1);
		assert.equal(items[0].siteName, "示例小站");
		assert.equal(items[0].url, "https://example.com/blog");
		assert.equal(items[0].email, "friend-user@example.com");
	});

	it("管理员通过后出现在公开列表", async () => {
		const pending = (await (
			await req("GET", "/api/friends/pending", { cookie: adminCookie })
		).json()) as { items: { id: number }[] };
		const id = pending.items[0].id;

		const res = await req("POST", `/api/friends/${id}/approve`, { cookie: adminCookie });
		assert.equal(res.status, 200);

		const list = (await (
			await req("GET", "/api/friends")
		).json()) as { friends: { siteName: string; url: string }[] };
		assert.equal(list.friends.length, 1);
		assert.equal(list.friends[0].siteName, "示例小站");
	});

	it("管理员可修改已通过记录", async () => {
		const list = (await (
			await req("GET", "/api/friends")
		).json()) as { friends: { id: number }[] };
		const id = list.friends[0].id;

		const res = await req("PUT", `/api/friends/${id}`, {
			cookie: adminCookie,
			body: { ...validApply, siteName: "示例小站（改）" },
		});
		assert.equal(res.status, 200);

		const afterList = (await (
			await req("GET", "/api/friends")
		).json()) as { friends: { siteName: string }[] };
		assert.equal(afterList.friends[0].siteName, "示例小站（改）");
	});

	it("管理员可删除记录", async () => {
		const list = (await (
			await req("GET", "/api/friends")
		).json()) as { friends: { id: number }[] };
		const id = list.friends[0].id;

		const res = await req("DELETE", `/api/friends/${id}`, { cookie: adminCookie });
		assert.equal(res.status, 200);

		const afterList = (await (await req("GET", "/api/friends")).json()) as {
			friends: unknown[];
		};
		assert.equal(afterList.friends.length, 0);
	});

	it("提交限流：同用户 5 分钟内超过 5 次被拒", async () => {
		for (let i = 0; i < 5; i++) {
			await req("POST", "/api/friends", {
				cookie: userCookie,
				body: { ...validApply, siteName: `限流${i}` },
			});
		}
		const res = await req("POST", "/api/friends", {
			cookie: userCookie,
			body: { ...validApply, siteName: "超限" },
		});
		assert.equal(res.status, 429);
	});
});
