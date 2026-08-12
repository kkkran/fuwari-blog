/**
 * 博客后端通知集成测试（node:test + tsx 运行）
 *
 * 覆盖链路：注册 → 制造未读通知 → unread-count 反映未读数（导航栏红点来源）
 * → POST /notifications/read 标记已读 → unread-count 归零（红点消失契约）；
 * 以及带 ids 的部分标记行为。
 *
 * 运行：pnpm test（tsx --test test/*.test.ts）
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 必须在导入任何 server 模块前设置，dotenv 不会覆盖已存在的环境变量
const tmpDir = mkdtempSync(join(tmpdir(), "fuwari-notif-test-"));
process.env.DATABASE_PATH = join(tmpDir, "test.db");
process.env.CORS_ORIGIN = "http://127.0.0.1:4321,http://localhost:4321";

const { createApp } = await import("../src/index.js");
const { getUserByEmail } = await import("../src/users.js");
const { createNotification } = await import("../src/notifications.js");
const { config } = await import("../src/config.js");

const app = createApp();
const server = await new Promise<import("node:http").Server>((resolve) => {
	const s = app.listen(0, "127.0.0.1", () => resolve(s));
});

const BASE = `http://127.0.0.1:${(server.address() as import("net").AddressInfo).port}`;

function extractCookie(response: Response, name: string): string | null {
	for (const cookie of response.headers.getSetCookie()) {
		const match = cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
		if (match) return match[1];
	}
	return null;
}

async function postJson(path: string, body: unknown, cookie?: string) {
	return fetch(`${BASE}${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(cookie ? { Cookie: cookie } : {}),
		},
		body: JSON.stringify(body),
	});
}

async function getJson(path: string, cookie: string) {
	return fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
}

after(async () => {
	server.close();
	const { db } = await import("../src/db.js");
	db.close();
	rmSync(tmpDir, {
		recursive: true,
		force: true,
		maxRetries: 5,
		retryDelay: 100,
	});
});

describe("通知未读徽标", () => {
	let cookie = "";
	let userId = 0;

	before(async () => {
		const res = await postJson("/api/auth/register", {
			email: "notify@example.com",
			password: "password123",
			displayName: "Notify",
		});
		assert.equal(res.status, 201);
		cookie = `${
			config.sessionCookieName
		}=${extractCookie(res, config.sessionCookieName)}`;
		userId = getUserByEmail("notify@example.com")!.id;
	});

	it("有未读通知时 unread-count 反映未读数（导航栏红点来源）", async () => {
		createNotification(userId, "review_result", "你的文章《A》已审核通过");
		createNotification(userId, "review_result", "你的文章《B》已审核通过");

		const res = await getJson("/api/notifications/unread-count", cookie);
		assert.equal(res.status, 200);
		const body = (await res.json()) as { count: number };
		assert.equal(body.count, 2);
	});

	it("POST /read 缺省 ids 时标记全部已读，unread-count 归零（红点消失契约）", async () => {
		const res = await postJson("/api/notifications/read", {}, cookie);
		assert.equal(res.status, 200);
		const body = (await res.json()) as { ok: boolean };
		assert.equal(body.ok, true);

		const count = await getJson("/api/notifications/unread-count", cookie);
		const countBody = (await count.json()) as { count: number };
		assert.equal(countBody.count, 0, "标记全部已读后未读数应为 0");
	});

	it("POST /read 带 ids 时仅标记指定通知", async () => {
		createNotification(userId, "review_result", "你的文章《C》已审核通过");
		createNotification(userId, "review_result", "你的文章《D》已审核通过");

		const list = await getJson("/api/notifications", cookie);
		const items = ((await list.json()) as {
			items: { id: number; read: boolean }[];
		}).items;
		const unreadItems = items.filter((item) => !item.read);
		assert.equal(unreadItems.length, 2, "第 3 条测试应产生两条未读通知");

		await postJson("/api/notifications/read", { ids: [unreadItems[0].id] }, cookie);

		const count = await getJson("/api/notifications/unread-count", cookie);
		const countBody = (await count.json()) as { count: number };
		assert.equal(countBody.count, 1, "仅标记一条后应剩 1 条未读");
	});
});
