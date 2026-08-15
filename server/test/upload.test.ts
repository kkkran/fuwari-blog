/**
 * 上传接口集成测试（node:test + tsx）
 *
 * 覆盖：图床禁用 → 本地落盘；图床成功 → 返回图床 URL 且本地无残留；
 * 图床登录/上传失败 → 回退本地存储；未登录 → 401。
 *
 * 图床通过 URL 分流的 fetch mock 模拟：仅拦截 fake-oneimg 域名的请求，
 * 其余请求走真实 fetch（测试客户端与 server 之间为真实 HTTP）。
 */
import { after, before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 必须在导入任何 server 模块前设置（dotenv 不覆盖已存在的环境变量）
const tmpDir = mkdtempSync(join(tmpdir(), "fuwari-upload-test-"));
process.env.DATABASE_PATH = join(tmpDir, "test.db");
process.env.CORS_ORIGIN = "http://127.0.0.1:4321,http://localhost:4321";
process.env.IMAGE_HOSTING_ENABLED = "true";
process.env.IMAGE_HOSTING_BASE_URL = "http://fake-oneimg:8080";
process.env.IMAGE_HOSTING_USERNAME = "test-user";
process.env.IMAGE_HOSTING_PASSWORD = "test-pass";
// 图床公网域名：上传接口返回的 URL 必须基于它（而非内网 base）
process.env.IMAGE_PUBLIC_BASE_URL = "https://img.miscoke.top";

const { createApp } = await import("../src/index.js");
const { config } = await import("../src/config.js");
const { resetImageHostingSession } = await import("../src/image-hosting.js");

const app = createApp();
const server = await new Promise<import("node:http").Server>((resolve) => {
	const s = app.listen(0, "127.0.0.1", () => resolve(s));
});
const BASE = `http://127.0.0.1:${(server.address() as import("net").AddressInfo).port}`;

const realFetch = globalThis.fetch;

// 1x1 透明 PNG
const PNG_BYTES = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
	"base64",
);

interface FakeOptions {
	loginOk?: boolean;
	uploadOk?: boolean;
	/** 图床返回的图片 URL（默认内网绝对 URL，用于验证公网重写） */
	uploadUrl?: string;
}

function fakeFetchFor(options: FakeOptions): typeof fetch {
	const { loginOk = true, uploadOk = true, uploadUrl = "http://fake-oneimg:8080/uploads/2026/08/fake.webp" } =
		options;
	return ((input: string | URL, init?: RequestInit) => {
		const url = String(input);
		if (url.startsWith("http://fake-oneimg:8080")) {
			if (url.endsWith("/api/login")) {
				return Promise.resolve(
					new Response(
						JSON.stringify(
							loginOk
								? { code: 200, message: "登录成功", data: { token: "T" } }
								: { code: 401, message: "用户名或密码错误" },
						),
						{
							status: 200,
							headers: {
								"content-type": "application/json",
								"set-cookie": "oneimg-session=COOKIE; Path=/",
							},
						},
					),
				);
			}
			if (url.endsWith("/api/upload")) {
				return Promise.resolve(
					new Response(
						JSON.stringify(
							uploadOk
								? {
										code: 200,
										message: "上传成功",
										data: {
											count: 1,
											files: [{ id: 9, url: uploadUrl }],
										},
									}
								: { code: 400, message: "文件解析失败" },
						),
						{ status: 200, headers: { "content-type": "application/json" } },
					),
				);
			}
		}
		return realFetch(input, init);
	}) as typeof fetch;
}

function listUploads(): string[] {
	return readdirSync("./data/uploads", { recursive: true }).map(String);
}

function extractCookie(response: Response): string | null {
	for (const cookie of response.headers.getSetCookie()) {
		const match = cookie.match(/fuwari_session=([^;]+)/);
		if (match) return match[1];
	}
	return null;
}

async function registerAndGetCookie(): Promise<string> {
	const res = await fetch(`${BASE}/api/auth/register`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			email: "uploader@example.com",
			password: "password123",
			displayName: "Uploader",
		}),
	});
	assert.equal(res.status, 201);
	const cookie = extractCookie(res);
	assert.ok(cookie);
	return `fuwari_session=${cookie}`;
}

async function uploadImage(cookie: string): Promise<Response> {
	const form = new FormData();
	form.append("file", new Blob([PNG_BYTES], { type: "image/png" }), "test.png");
	return fetch(`${BASE}/api/upload`, {
		method: "POST",
		headers: { Cookie: cookie },
		body: form,
	});
}

let authCookie = "";
let uploadsBefore: string[] = [];

before(async () => {
	authCookie = await registerAndGetCookie();
});

after(async () => {
	server.close();
	const { db } = await import("../src/db.js");
	db.close();
	rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
	uploadsBefore = listUploads();
	config.imageHosting.enabled = true;
	resetImageHostingSession();
	mock.restoreAll();
});

describe("POST /api/upload", () => {
	it("未登录返回 401", async () => {
		const res = await uploadImage("");
		assert.equal(res.status, 401);
	});

	it("图床禁用时落盘本地，返回 /uploads/ 相对 URL", async () => {
		config.imageHosting.enabled = false;
		const res = await uploadImage(authCookie);
		assert.equal(res.status, 201);
		const body = (await res.json()) as { url: string };
		assert.ok(body.url.startsWith("/uploads/"), `应为本地 URL，实际: ${body.url}`);
		const newFiles = listUploads().filter((f) => !uploadsBefore.includes(f));
		assert.equal(newFiles.length, 1, "本地应新增一个文件");
	});

	it("图床成功时返回公网图床 URL（内网绝对 URL 重写为公网域名），本地无新增文件", async () => {
		mock.method(globalThis, "fetch", fakeFetchFor({}));
		const res = await uploadImage(authCookie);
		assert.equal(res.status, 201);
		const body = (await res.json()) as { url: string };
		// 图床 base 是内网地址，返回给前端前必须重写为公网图床域名
		assert.equal(body.url, "https://img.miscoke.top/uploads/2026/08/fake.webp");
		const newFiles = listUploads().filter((f) => !uploadsBefore.includes(f));
		assert.equal(newFiles.length, 0, "图床成功时本地不应落盘");
	});

	it("图床返回相对 URL 时拼接公网图床域名", async () => {
		mock.method(globalThis, "fetch", fakeFetchFor({ uploadUrl: "/uploads/2026/08/fake.webp" }));
		const res = await uploadImage(authCookie);
		assert.equal(res.status, 201);
		const body = (await res.json()) as { url: string };
		assert.equal(body.url, "https://img.miscoke.top/uploads/2026/08/fake.webp");
	});

	it("已是公网图床域名的 URL 保持原样", async () => {
		mock.method(
			globalThis,
			"fetch",
			fakeFetchFor({ uploadUrl: "https://img.miscoke.top/uploads/2026/08/fake.webp" }),
		);
		const res = await uploadImage(authCookie);
		assert.equal(res.status, 201);
		const body = (await res.json()) as { url: string };
		assert.equal(body.url, "https://img.miscoke.top/uploads/2026/08/fake.webp");
	});

	it("图床业务失败时回退本地存储", async () => {
		mock.method(globalThis, "fetch", fakeFetchFor({ uploadOk: false }));
		const res = await uploadImage(authCookie);
		assert.equal(res.status, 201);
		const body = (await res.json()) as { url: string };
		assert.ok(body.url.startsWith("/uploads/"), `应回退本地 URL，实际: ${body.url}`);
		const newFiles = listUploads().filter((f) => !uploadsBefore.includes(f));
		assert.equal(newFiles.length, 1, "回退时本地应新增一个文件");
	});

	it("图床登录失败时回退本地存储", async () => {
		mock.method(globalThis, "fetch", fakeFetchFor({ loginOk: false }));
		const res = await uploadImage(authCookie);
		assert.equal(res.status, 201);
		const body = (await res.json()) as { url: string };
		assert.ok(body.url.startsWith("/uploads/"), `应回退本地 URL，实际: ${body.url}`);
	});
});
