/**
 * 博客后端 auth 集成测试（node:test + tsx 运行）
 *
 * 覆盖链路：注册 → 会话恢复 → 重复注册 → 登录 → 密码错误；
 * 以及历史 bug 回归：CORS 拒绝应为 403 而非 500、localhost 默认放行、
 * 同日过期 session 判定、邮箱大小写/空格规范化。
 *
 * 运行：pnpm test（tsx --test test/*.test.ts）
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 必须在导入任何 server 模块前设置，dotenv 不会覆盖已存在的环境变量
const tmpDir = mkdtempSync(join(tmpdir(), "fuwari-test-"));
process.env.DATABASE_PATH = join(tmpDir, "test.db");
// 模拟典型开发配置：同时放行 127.0.0.1 与 localhost（历史 bug：只放行前者，
// 从 Astro dev 默认地址 localhost:4321 访问时所有 API 请求被 CORS 拒绝并返回 500）
process.env.CORS_ORIGIN = "http://127.0.0.1:4321,http://localhost:4321";

const { createApp } = await import("../src/index.js");
const { createSession, getUserByEmail } = await import("../src/users.js");
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

async function postJson(path: string, body: unknown, origin?: string) {
	return fetch(`${BASE}${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(origin ? { Origin: origin } : {}),
		},
		body: JSON.stringify(body),
	});
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

describe("邮箱注册/登录", () => {
	it("注册成功返回 201 并种下会话 cookie，随后可凭 cookie 恢复会话", async () => {
		const res = await postJson("/api/auth/register", {
			email: "alice@example.com",
			password: "password123",
			displayName: "Alice",
		});
		assert.equal(res.status, 201);
		const token = extractCookie(res, config.sessionCookieName);
		assert.ok(token, "应设置会话 cookie");

		const session = await fetch(`${BASE}/api/auth/session`, {
			headers: { Cookie: `${config.sessionCookieName}=${token}` },
		});
		const body = (await session.json()) as { user: { email: string } | null };
		assert.equal(body.user?.email, "alice@example.com");
	});

	it("重复注册同一邮箱返回 409", async () => {
		const res = await postJson("/api/auth/register", {
			email: "alice@example.com",
			password: "password456",
			displayName: "Alice2",
		});
		assert.equal(res.status, 409);
	});

	it("登录成功返回 200 并种 cookie", async () => {
		const res = await postJson("/api/auth/login", {
			email: "alice@example.com",
			password: "password123",
		});
		assert.equal(res.status, 200);
		assert.ok(extractCookie(res, config.sessionCookieName));
	});

	it("密码错误返回 401", async () => {
		const res = await postJson("/api/auth/login", {
			email: "alice@example.com",
			password: "wrong-password",
		});
		assert.equal(res.status, 401);
	});

	it("邮箱大小写与首尾空格不敏感：注册规范化，登录与查重均匹配", async () => {
		// 注册时 trim + lowercase 后存储
		const reg = await postJson("/api/auth/register", {
			email: "  Bob@Example.com ",
			password: "password123",
			displayName: "Bob",
		});
		assert.equal(reg.status, 201, "带空格/大小写混合的邮箱应注册成功");
		assert.ok(getUserByEmail("bob@example.com"), "应以小写形式存储");

		// 登录时大小写不同仍可成功
		const login = await postJson("/api/auth/login", {
			email: "BOB@example.com",
			password: "password123",
		});
		assert.equal(login.status, 200, "登录应忽略邮箱大小写");

		// 大小写不同的重复注册应被拦截
		const dup = await postJson("/api/auth/register", {
			email: "bOb@example.com",
			password: "password456",
			displayName: "Bob2",
		});
		assert.equal(dup.status, 409, "大小写不同的同邮箱应判重");
	});
});

describe("CORS", () => {
	it("localhost:4321 来源的登录请求可通过 CORS", async () => {
		const res = await postJson(
			"/api/auth/login",
			{ email: "alice@example.com", password: "password123" },
			"http://localhost:4321",
		);
		assert.equal(res.status, 200);
		assert.equal(
			res.headers.get("access-control-allow-origin"),
			"http://localhost:4321",
		);
	});

	it("不允许的来源返回 403 JSON 而非 500", async () => {
		const res = await postJson(
			"/api/auth/login",
			{ email: "alice@example.com", password: "password123" },
			"http://evil.example.com",
		);
		assert.equal(res.status, 403, "CORS 拒绝应为 403");
		const body = (await res.json()) as { error: string };
		assert.ok(body.error, "应返回可读的错误信息");
	});
});

describe("session 过期", () => {
	it("同日已过期的 session 不可用（ISO 时间与 datetime('now') 混合比较的回归）", async () => {
		const token = createSession(getUserByEmail("alice@example.com")!.id);
		// 手动把过期时间改为 1 小时前（保持 ISO 8601 格式，模拟存量数据）
		const { db } = await import("../src/db.js");
		db.prepare(
			"UPDATE sessions SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour') WHERE token = ?",
		).run(token);

		const res = await fetch(`${BASE}/api/auth/session`, {
			headers: { Cookie: `${config.sessionCookieName}=${token}` },
		});
		const body = (await res.json()) as { user: unknown };
		assert.equal(body.user, null, "已过期 session 应判定失效");
	});
});
