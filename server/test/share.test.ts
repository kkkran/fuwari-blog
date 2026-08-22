/**
 * txt 文件分享接口集成测试（node:test + tsx）
 *
 * 覆盖（按接缝 S1-S6）：
 * S1 POST /api/share —— 认证/类型校验/上限与 pending
 * S2 GET /share/<uuid>.txt —— Clash 兼容的公开纯文本读取
 * S3 GET /api/share/my —— 我的列表
 * S4 DELETE /api/share/:id —— 本人/管理员/他人
 * S5 管理员审核 pending/approve/reject
 * S6 过期清扫 sweepExpired()
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 必须在导入任何 server 模块前设置
const tmpDir = mkdtempSync(join(tmpdir(), "fuwari-share-test-"));
process.env.DATABASE_PATH = join(tmpDir, "test.db");
process.env.SHARE_DIR = join(tmpDir, "share");
process.env.CORS_ORIGIN = "http://127.0.0.1:4321,http://localhost:4321";
process.env.ADMIN_EMAILS = "share-admin@example.com";

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

/** 构造 multipart 上传请求 */
function uploadForm(
	content: string | Buffer,
	filename = "clash-config.txt",
): { body: FormData; headers: HeadersInit } {
	const fd = new FormData();
	fd.append(
		"file",
		new Blob([content], { type: "text/plain" }),
		filename,
	);
	return { body: fd, headers: {} };
}

let userCookie = "";
let adminCookie = "";

before(async () => {
	userCookie = await register("share-user@example.com", "分享用户");
	adminCookie = await register("share-admin@example.com", "管理员");
});

after(async () => {
	server.close();
	const { db } = await import("../src/db.js");
	db.close();
	rmSync(tmpDir, { recursive: true, force: true });
});

describe("S1 POST /api/share 上传", () => {
	it("未登录上传被拒（401）", async () => {
		const { body, headers } = uploadForm("mixed-port: 7890");
		const res = await fetch(`${BASE}/api/share`, {
			method: "POST",
			headers,
			body,
		});
		assert.equal(res.status, 401);
	});

	it("非 .txt 文件被拒（400）", async () => {
		const fd = new FormData();
		fd.append("file", new Blob(["not a txt"], { type: "image/png" }), "evil.png");
		const res = await fetch(`${BASE}/api/share`, {
			method: "POST",
			headers: { Cookie: userCookie },
			body: fd,
		});
		assert.equal(res.status, 400);
	});

	it("内容为非法 UTF-8 的 .txt 被拒（400，夹带二进制）", async () => {
		// 0xFF 0xFE 不是合法 UTF-8 序列——伪装成 txt 的二进制内容必须被拦截
		const binary = Buffer.from([0xff, 0xfe, 0x01, 0x02, 0x00]);
		const { body, headers } = uploadForm(binary, "fake.txt");
		const res = await fetch(`${BASE}/api/share`, {
			method: "POST",
			headers: { ...headers, Cookie: userCookie },
			body,
		});
		assert.equal(res.status, 400);
	});

	it("正常上传返回 approved 与 /share/<uuid>.txt 链接", async () => {
		const content = "mixed-port: 7890\nproxies: []";
		const { body, headers } = uploadForm(content);
		const res = await fetch(`${BASE}/api/share`, {
			method: "POST",
			headers: { ...headers, Cookie: userCookie },
			body,
		});
		assert.equal(res.status, 201);
		const json = (await res.json()) as {
			id: string;
			rawUrl: string;
			status: string;
		};
		assert.equal(json.status, "approved");
		assert.match(json.rawUrl, /^\/share\/[0-9a-f-]{36}\.txt$/);
	});

	it("活跃文件达到 10 个后，新上传进入 pending", async () => {
		const heavyCookie = await register("share-heavy@example.com", "上传大户");
		for (let i = 1; i <= 10; i++) {
			const { body, headers } = uploadForm(`clash 配置第 ${i} 份`);
			const res = await fetch(`${BASE}/api/share`, {
				method: "POST",
				headers: { ...headers, Cookie: heavyCookie },
				body,
			});
			assert.equal(res.status, 201);
			const json = (await res.json()) as { status: string };
			assert.equal(json.status, "approved", `第 ${i} 个应为 approved`);
		}
		// 第 11 个：超出 10 个活跃上限 → pending，等待管理员审核
		const { body, headers } = uploadForm("第 11 份配置文件");
		const res = await fetch(`${BASE}/api/share`, {
			method: "POST",
			headers: { ...headers, Cookie: heavyCookie },
			body,
		});
		assert.equal(res.status, 201);
		const json = (await res.json()) as { status: string };
		assert.equal(json.status, "pending");
	});
});