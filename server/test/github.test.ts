/**
 * GitHub OAuth 邮箱获取测试（node:test + tsx）
 *
 * 回归保护：GitHub 已默认不返回私有邮箱（/user 的 email 为 null），
 * 必须回退调用 /user/emails（需 user:email scope）取主邮箱，
 * 否则同邮箱自动绑定失效，GitHub 登录会创建独立账号。
 */
import { after, before, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 必须在导入任何 server 模块前设置
const tmpDir = mkdtempSync(join(tmpdir(), "fuwari-github-test-"));
process.env.DATABASE_PATH = join(tmpDir, "test.db");
process.env.ADMIN_EMAILS = "1416024707@qq.com";

const { authenticateWithGithub } = await import("../src/github.js");

const realFetch = globalThis.fetch;

interface FakeGithubOptions {
	/** /user 返回的 email（null 表示私有邮箱） */
	userEmail?: string | null;
	/** /user/emails 返回的列表 */
	emails?: Array<{ email: string; primary: boolean; verified: boolean }>;
	/** /user/emails 是否报错 */
	emailsFail?: boolean;
}

function fakeFetchFor(options: FakeGithubOptions): typeof fetch {
	const { userEmail = "public@example.com", emails = [], emailsFail = false } = options;
	return ((input: string | URL, init?: RequestInit) => {
		const url = String(input);
		const method = (init?.method ?? "GET").toUpperCase();

		if (url === "https://github.com/login/oauth/access_token") {
			return Promise.resolve(
				new Response(JSON.stringify({ access_token: "TOKEN" }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			);
		}
		if (url === "https://api.github.com/user") {
			return Promise.resolve(
				new Response(
					JSON.stringify({
						id: 1272604,
						login: "miscoke",
						name: "Shijie",
						email: userEmail,
						avatar_url: "https://avatars.example/1.png",
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				),
			);
		}
		if (url === "https://api.github.com/user/emails") {
			if (emailsFail) {
				return Promise.resolve(new Response("", { status: 403 }));
			}
			return Promise.resolve(
				new Response(JSON.stringify(emails), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			);
		}
		return realFetch(input, init);
	}) as typeof fetch;
}

after(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

describe("authenticateWithGithub 邮箱获取", () => {
	it("公开邮箱：直接使用 /user 返回的 email，不额外请求 /user/emails", async () => {
		mock.method(globalThis, "fetch", fakeFetchFor({ userEmail: "public@example.com" }));
		const user = await authenticateWithGithub("code");
		assert.equal(user.email, "public@example.com");
		assert.equal(user.login, "miscoke");
	});

	it("私有邮箱：/user 无 email 时回退 /user/emails，取 primary+verified 邮箱", async () => {
		mock.method(
			globalThis,
			"fetch",
			fakeFetchFor({
				userEmail: null,
				emails: [
					{ email: "noreply@users.noreply.github.com", primary: false, verified: true },
					{ email: "1416024707@qq.com", primary: true, verified: true },
				],
			}),
		);
		const user = await authenticateWithGithub("code");
		assert.equal(user.email, "1416024707@qq.com");
	});

	it("私有邮箱且无 primary 时，取任一 verified 邮箱", async () => {
		mock.method(
			globalThis,
			"fetch",
			fakeFetchFor({
				userEmail: null,
				emails: [
					{ email: "backup@example.com", primary: false, verified: true },
				],
			}),
		);
		const user = await authenticateWithGithub("code");
		assert.equal(user.email, "backup@example.com");
	});

	it("私有邮箱且 /user/emails 失败时 email 为 null（不崩溃）", async () => {
		mock.method(
			globalThis,
			"fetch",
			fakeFetchFor({ userEmail: null, emailsFail: true }),
		);
		const user = await authenticateWithGithub("code");
		assert.equal(user.email, null);
		assert.equal(user.login, "miscoke");
	});
});
