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

/** 上传并返回原始链接（approved 场景的共用步骤） */
async function uploadApproved(cookie: string, content: string): Promise<string> {
	const { body, headers } = uploadForm(content);
	const res = await fetch(`${BASE}/api/share`, {
		method: "POST",
		headers: { ...headers, Cookie: cookie },
		body,
	});
	assert.equal(res.status, 201);
	const json = (await res.json()) as { rawUrl: string };
	return json.rawUrl;
}

describe("S2 GET /share/<uuid>.txt 公开读取", () => {
	it("approved 文件公开可读：text/plain + nosniff + inline + 内容逐字节一致", async () => {
		const content = `mixed-port: 7890
proxies:
  - name: node-1
    server: 1.2.3.4
    port: 443
rules:
  - MATCH,node-1`;
		const rawUrl = await uploadApproved(userCookie, content);

		const res = await fetch(`${BASE}${rawUrl}`);
		assert.equal(res.status, 200);
		assert.ok(
			(res.headers.get("content-type") ?? "").startsWith("text/plain"),
			`Content-Type 应为 text/plain，实际: ${res.headers.get("content-type")}`,
		);
		assert.equal(
			res.headers.get("x-content-type-options"),
			"nosniff",
			"必须 nosniff，防止内容嗅探执行",
		);
		assert.ok(
			(res.headers.get("content-disposition") ?? "").toLowerCase().includes("inline"),
			"应为 inline 直读（Clash 客户端直接消费）",
		);
		assert.equal(await res.text(), content, "响应体必须与上传原文逐字节一致");
	});

	it("pending 文件读取返回 404", async () => {
		const heavyCookie = await register("share-pending@example.com", "待审用户");
		// 上传 10 个占满后，第 11 个进入 pending
		for (let i = 0; i < 10; i++) {
			const { body, headers } = uploadForm(`占位配置 ${i}`);
			await fetch(`${BASE}/api/share`, {
				method: "POST",
				headers: { ...headers, Cookie: heavyCookie },
				body,
			});
		}
		const { body, headers } = uploadForm("等待审核的配置");
		const res = await fetch(`${BASE}/api/share`, {
			method: "POST",
			headers: { ...headers, Cookie: heavyCookie },
			body,
		});
		const json = (await res.json()) as { rawUrl: string; status: string };
		assert.equal(json.status, "pending");

		const readRes = await fetch(`${BASE}${json.rawUrl}`);
		assert.equal(readRes.status, 404, "未审核的文件不可被读取");
	});

	it("不存在的文件读取返回 404", async () => {
		const res = await fetch(`${BASE}/share/00000000-0000-0000-0000-000000000000.txt`);
		assert.equal(res.status, 404);
	});

	it("已过期文件读取返回 404", async () => {
		const rawUrl = await uploadApproved(userCookie, "将被过期处理的配置");
		// 测试夹具：直接把过期时间改到过去（模拟时间流逝）
		const { db } = await import("../src/db.js");
		const id = rawUrl.split("/").pop()!.replace(".txt", "");
		db.prepare("UPDATE share_files SET expires_at = ? WHERE id = ?").run(
			new Date(Date.now() - 60_000).toISOString(),
			id,
		);

		const res = await fetch(`${BASE}${rawUrl}`);
		assert.equal(res.status, 404, "过期文件应不可访问");
	});
});

describe("S3 GET /api/share/my 我的列表", () => {
	it("未登录访问我的列表返回 401", async () => {
		const res = await fetch(`${BASE}/api/share/my`);
		assert.equal(res.status, 401);
	});

	it("只返回自己的文件且字段完整", async () => {
		const userB = await register("share-b@example.com", "用户B");
		const rawA = await uploadApproved(userCookie, "A 的 clash 配置");
		const rawB = await uploadApproved(userB, "B 的 clash 配置");
		assert.notEqual(rawA, rawB);

		const res = await fetch(`${BASE}/api/share/my`, {
			headers: { Cookie: userCookie },
		});
		assert.equal(res.status, 200);
		const json = (await res.json()) as {
			files: Array<{
				id: string;
				filename: string;
				status: string;
				size: number;
				rawUrl: string;
				expiresAt: string | null;
			}>;
		};
		assert.ok(Array.isArray(json.files), "应返回 files 数组");
		const mine = json.files.filter((f) => f.rawUrl === rawA);
		assert.equal(mine.length, 1, "列表中应包含自己刚上传的文件");
		assert.equal(mine[0].status, "approved");
		assert.ok(mine[0].size > 0);
		// 默认过期档位 7 天：expiresAt 应落在未来 7 天附近
		const remain = new Date(mine[0].expiresAt!).getTime() - Date.now();
		assert.ok(remain > 6 * 86400_000 && remain < 8 * 86400_000, "默认 7 天过期，实际剩余毫秒: " + remain);
		const notMine = json.files.filter((f) => f.rawUrl === rawB);
		assert.equal(notMine.length, 0, "不能看到他人的文件");
	});
});

describe("S4 DELETE /api/share/:id 删除", () => {
	it("本人可删除：删除后读取返回 404 且磁盘文件消失", async () => {
		const rawUrl = await uploadApproved(userCookie, "待删除的配置");
		const id = rawUrl.split("/").pop()!.replace(".txt", "");

		const res = await fetch(`${BASE}/api/share/${id}`, {
			method: "DELETE",
			headers: { Cookie: userCookie },
		});
		assert.equal(res.status, 200);

		const readRes = await fetch(`${BASE}${rawUrl}`);
		assert.equal(readRes.status, 404, "删除后不可再读取");
		// 落盘文件应同步清理
		const { existsSync } = await import("node:fs");
		const { SHARE_DIR } = await import("../src/share.js");
		assert.equal(existsSync(`${SHARE_DIR}/${id}.txt`), false, "磁盘文件应被删除");
	});

	it("管理员可删除他人文件", async () => {
		const other = await register("share-victim@example.com", "受害者");
		const rawUrl = await uploadApproved(other, "管理员的猎物");
		const id = rawUrl.split("/").pop()!.replace(".txt", "");

		const res = await fetch(`${BASE}/api/share/${id}`, {
			method: "DELETE",
			headers: { Cookie: adminCookie },
		});
		assert.equal(res.status, 200);
	});

	it("非本人且非管理员删除他人文件返回 403", async () => {
		const owner = await register("share-owner@example.com", "主人");
		const intruder = await register("share-intruder@example.com", "入侵者");
		const rawUrl = await uploadApproved(owner, "私有配置");
		const id = rawUrl.split("/").pop()!.replace(".txt", "");

		const res = await fetch(`${BASE}/api/share/${id}`, {
			method: "DELETE",
			headers: { Cookie: intruder },
		});
		assert.equal(res.status, 403);
	});

	it("删除不存在的 id 返回 404", async () => {
		const res = await fetch(`${BASE}/api/share/00000000-0000-0000-0000-000000000000`, {
			method: "DELETE",
			headers: { Cookie: adminCookie },
		});
		assert.equal(res.status, 404);
	});
});

describe("S5 管理员审核 pending", () => {
	/** 制造一个 pending 文件，返回其 id */
	async function seedPending(cookie: string): Promise<string> {
		for (let i = 0; i < 10; i++) {
			const { body, headers } = uploadForm(`占位 ${i}`);
			await fetch(`${BASE}/api/share`, {
				method: "POST",
				headers: { ...headers, Cookie: cookie },
				body,
			});
		}
		const { body, headers } = uploadForm("待审核的配置");
		const up = await fetch(`${BASE}/api/share`, {
			method: "POST",
			headers: { ...headers, Cookie: cookie },
			body,
		});
		assert.equal(up.status, 201);
		const json = (await up.json()) as { id: string; status: string };
		assert.equal(json.status, "pending");
		return json.id;
	}

	it("非管理员访问待审列表返回 403", async () => {
		const res = await fetch(`${BASE}/api/share/admin/pending`, {
			headers: { Cookie: userCookie },
		});
		assert.equal(res.status, 403);
	});

	it("管理员可见待审文件（含上传者与原始文件名）", async () => {
		const pendingUser = await register("share-review@example.com", "待审用户");
		const pendingId = await seedPending(pendingUser);

		const res = await fetch(`${BASE}/api/share/admin/pending`, {
			headers: { Cookie: adminCookie },
		});
		assert.equal(res.status, 200);
		const json = (await res.json()) as {
			files: Array<{ id: string; email: string; filename: string; status: string }>;
		};
		const item = json.files.find((f) => f.id === pendingId);
		assert.ok(item, "待审列表应包含该 pending 文件");
		assert.equal(item.status, "pending");
		assert.equal(item.email, "share-review@example.com");
		assert.equal(item.filename, "clash-config.txt");
	});

	it("通过审核后立即可读", async () => {
		const pendingUser = await register("share-approve@example.com", "获批用户");
		const pendingId = await seedPending(pendingUser);

		const before = await fetch(`${BASE}/share/${pendingId}.txt`);
		assert.equal(before.status, 404, "审核前不可读");

		const approve = await fetch(`${BASE}/api/share/admin/${pendingId}/approve`, {
			method: "POST",
			headers: { Cookie: adminCookie },
		});
		assert.equal(approve.status, 200);

		const after = await fetch(`${BASE}/share/${pendingId}.txt`);
		assert.equal(after.status, 200, "通过后立即可读");
		assert.equal(await after.text(), "待审核的配置");
	});

	it("拒绝后文件被删除且不可读", async () => {
		const pendingUser = await register("share-reject@example.com", "被拒用户");
		const pendingId = await seedPending(pendingUser);

		const reject = await fetch(`${BASE}/api/share/admin/${pendingId}/reject`, {
			method: "POST",
			headers: { Cookie: adminCookie },
		});
		assert.equal(reject.status, 200);

		const after = await fetch(`${BASE}/share/${pendingId}.txt`);
		assert.equal(after.status, 404, "拒绝后不可读");
		const { existsSync } = await import("node:fs");
		const { SHARE_DIR } = await import("../src/share.js");
		assert.equal(existsSync(`${SHARE_DIR}/${pendingId}.txt`), false, "磁盘文件应被删除");
	});

	it("管理员可预览 pending 文件内容（审核用）", async () => {
		const pendingUser = await register("share-preview@example.com", "预览用户");
		const pendingId = await seedPending(pendingUser);

		const res = await fetch(`${BASE}/api/share/admin/${pendingId}/content`, {
			headers: { Cookie: adminCookie },
		});
		assert.equal(res.status, 200);
		assert.equal(await res.text(), "待审核的配置");

		// 非管理员不可预览
		const denied = await fetch(`${BASE}/api/share/admin/${pendingId}/content`, {
			headers: { Cookie: userCookie },
		});
		assert.equal(denied.status, 403);
	});
});

describe("S6 sweepExpired 过期清扫", () => {
	it("过期文件：记录与磁盘文件均被清除", async () => {
		const rawUrl = await uploadApproved(userCookie, "过期清理对象");
		const id = rawUrl.split("/").pop()!.replace(".txt", "");
		const { db } = await import("../src/db.js");
		db.prepare("UPDATE share_files SET expires_at = ? WHERE id = ?").run(
			new Date(Date.now() - 60_000).toISOString(),
			id,
		);

		const { sweepExpired } = await import("../src/share.js");
		const removed = sweepExpired();
		assert.ok(removed >= 1, "应至少清除一个过期文件，实际: " + removed);

		const row = db.prepare("SELECT * FROM share_files WHERE id = ?").get(id);
		assert.equal(row, undefined, "过期记录应被删除");
		const { existsSync } = await import("node:fs");
		const { SHARE_DIR } = await import("../src/share.js");
		assert.equal(existsSync(`${SHARE_DIR}/${id}.txt`), false, "过期磁盘文件应被删除");
	});

	it("未过期文件不受清扫影响", async () => {
		await uploadApproved(userCookie, "永不过期？不，默认7天但尚未到期");
		const { sweepExpired } = await import("../src/share.js");
		const removed = sweepExpired();
		assert.equal(removed, 0, "没有过期文件时不应删除任何文件");
	});
});