/**
 * 赞助登记与审核 API 集成测试（规格：红 → 绿）
 *
 * 覆盖设计确认的完整流程：
 * - 未登录/非管理员权限边界；
 * - 提交校验（昵称/金额/备注）；
 * - 公开列表仅展示已通过、金额降序、匿名打码；
 * - 统计仅累计数字金额、匿名计入、待审不计入；
 * - 同账号重复赞助通过后合并累计（昵称/匿名取最新）；
 * - 管理员 拒绝/删除/修改 已通过记录；
 * - 提交限流。
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 必须在导入任何 server 模块前设置
const tmpDir = mkdtempSync(join(tmpdir(), "fuwari-sponsors-test-"));
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

let userACookie = "";
let userBCookie = "";
let userCCookie = "";
let userDCookie = "";
let adminCookie = "";

before(async () => {
	userACookie = await register("usera@example.com", "用户A");
	userBCookie = await register("userb@example.com", "用户B");
	userCCookie = await register("userc@example.com", "用户C");
	userDCookie = await register("userd@example.com", "用户D");
	adminCookie = await register("admin@example.com", "管理员");
});

after(async () => {
	server.close();
	const { db } = await import("../src/db.js");
	db.close();
	rmSync(tmpDir, { recursive: true, force: true });
});

describe("赞助登记与审核 API", () => {
	it("未登录提交返回 401", async () => {
		const res = await req("POST", "/api/sponsors", {
			body: { displayName: "路人", amount: 5 },
		});
		assert.equal(res.status, 401);
	});

	it("校验失败返回 400：空昵称/超长昵称/金额非法/备注超长", async () => {
		const cases: { body: unknown; message: string }[] = [
			{ body: { displayName: "  ", amount: 5 }, message: "空昵称" },
			{ body: { displayName: "x".repeat(25), amount: 5 }, message: "超长昵称" },
			{ body: { displayName: "小明", amount: 0 }, message: "金额为 0" },
			{ body: { displayName: "小明", amount: -1 }, message: "负金额" },
			{ body: { displayName: "小明", amount: "abc" }, message: "非数字金额" },
			{ body: { displayName: "小明", amount: 100000 }, message: "金额超上限" },
			{
				body: { displayName: "小明", amount: 5, remark: "x".repeat(201) },
				message: "备注超长",
			},
		];
		for (const c of cases) {
			const res = await req("POST", "/api/sponsors", {
				cookie: userACookie,
				body: c.body,
			});
			assert.equal(res.status, 400, c.message);
		}
	});

	it("登录用户提交成功（pending），公开列表不可见", async () => {
		const res = await req("POST", "/api/sponsors", {
			cookie: userACookie,
			body: { displayName: "Alex", amount: 10, remark: "支持一下" },
		});
		assert.equal(res.status, 201);
		const { sponsor } = (await res.json()) as {
			sponsor: { status: string; displayName: string; amount: number };
		};
		assert.equal(sponsor.status, "pending");
		assert.equal(sponsor.displayName, "Alex");
		assert.equal(sponsor.amount, 10);

		const list = await req("GET", "/api/sponsors");
		assert.equal(list.status, 200);
		const body = (await list.json()) as { sponsors: unknown[] };
		assert.equal(body.sponsors.length, 0, "pending 不应出现在公开列表");
	});

	it("公开列表仅返回已通过，且按金额降序", async () => {
		// 用户B 提交 20，用户A 已有 10；分别通过后 A(10) B(20) → 列表 B,A
		const bRes = await req("POST", "/api/sponsors", {
			cookie: userBCookie,
			body: { displayName: "Bob", amount: 20 },
		});
		assert.equal(bRes.status, 201);
		const bId = ((await bRes.json()) as { sponsor: { id: number } }).sponsor.id;

		const pending = await req("GET", "/api/sponsors/pending", {
			cookie: adminCookie,
		});
		assert.equal(pending.status, 200);
		const pendingBody = (await pending.json()) as {
			items: { id: number; email: string }[];
		};
		assert.ok(
			pendingBody.items.length >= 2,
			"管理员应看到所有待审记录（含提交者邮箱）",
		);
		assert.ok(
			pendingBody.items.every((item) => typeof item.email === "string"),
			"待审记录应带提交者账号邮箱",
		);

		const approvedB = await req("POST", `/api/sponsors/${bId}/approve`, {
			cookie: adminCookie,
		});
		assert.equal(approvedB.status, 200);

		const list = await req("GET", "/api/sponsors");
		const body = (await list.json()) as {
			sponsors: { id: number; displayName: string; amount: number; date: string }[];
		};
		assert.equal(body.sponsors.length, 1);
		assert.equal(body.sponsors[0].displayName, "Bob");
		assert.match(body.sponsors[0].date, /^\d{4}-\d{2}-\d{2}$/, "date 应为日期");
	});

	it("匿名赞助者显示为匿名用户，不泄露真实昵称", async () => {
		// 用全新账号（用户C），避免与 Bob 同账号合并
		const res = await req("POST", "/api/sponsors", {
			cookie: userCCookie,
			body: { displayName: "匿名希望", amount: 8, anonymous: true },
		});
		const anonId = ((await res.json()) as { sponsor: { id: number } }).sponsor.id;
		await req("POST", `/api/sponsors/${anonId}/approve`, { cookie: adminCookie });

		const list = await req("GET", "/api/sponsors");
		const raw = await list.text();
		assert.ok(!raw.includes("匿名希望"), "公开列表不得泄露匿名者真实昵称");
		const body = JSON.parse(raw) as {
			sponsors: { displayName: string; amount: number }[];
		};
		const anon = body.sponsors.find((s) => s.amount === 8);
		assert.ok(anon, "匿名赞助应计入名单");
		assert.equal(anon.displayName, "匿名用户");
	});

	it("统计：仅累计数字金额，匿名计入，pending 不计入", async () => {
		const stats = await req("GET", "/api/sponsors/stats");
		const body = (await stats.json()) as { count: number; amount: number };
		// 已通过：Bob 20 + 匿名 8 = 28，2 人
		assert.equal(body.count, 2);
		assert.equal(body.amount, 28);
	});

	it("同账号重复赞助：通过后合并为一条并累计金额，昵称/匿名取最新", async () => {
		// 用户A 已有 pending 10；再提交 5（匿名）→ 两条 pending
		const res = await req("POST", "/api/sponsors", {
			cookie: userACookie,
			body: { displayName: "Alex2", amount: 5, anonymous: true },
		});
		const secondId = ((await res.json()) as { sponsor: { id: number } }).sponsor.id;

		// 先通过第一条（10，Alex）
		const pending = await req("GET", "/api/sponsors/pending", {
			cookie: adminCookie,
		});
		const items = ((await pending.json()) as { items: { id: number }[] }).items;
		const alexId = items.find((i) => i.id !== secondId)!.id;
		await req("POST", `/api/sponsors/${alexId}/approve`, { cookie: adminCookie });

		// 再通过第二条（5，匿名）→ 应合并进 Alex 的记录
		const merged = await req("POST", `/api/sponsors/${secondId}/approve`, {
			cookie: adminCookie,
		});
		assert.equal(merged.status, 200);
		const mergedSponsor = ((await merged.json()) as { sponsor: { amount: number } })
			.sponsor;
		assert.equal(mergedSponsor.amount, 15, "同账号金额应累计为 10+5");

		const list = await req("GET", "/api/sponsors");
		const body = (await list.json()) as {
			sponsors: { id: number; displayName: string; amount: number }[];
		};
		const alexCards = body.sponsors.filter((s) => s.amount === 15);
		assert.equal(alexCards.length, 1, "合并后仍应只有一张卡");
		assert.equal(alexCards[0].displayName, "匿名用户", "昵称/匿名取最新提交");
	});

	it("普通用户访问管理接口返回 403，未登录返回 401", async () => {
		const asUser = await req("GET", "/api/sponsors/pending", {
			cookie: userACookie,
		});
		assert.equal(asUser.status, 403);
		const anon = await req("GET", "/api/sponsors/pending");
		assert.equal(anon.status, 401);
		const asUserApprove = await req("POST", "/api/sponsors/1/approve", {
			cookie: userACookie,
		});
		assert.equal(asUserApprove.status, 403);
	});

	it("管理员可拒绝：拒绝后不出现公开列表", async () => {
		const res = await req("POST", "/api/sponsors", {
			cookie: userACookie,
			body: { displayName: "拒绝我", amount: 3 },
		});
		const id = ((await res.json()) as { sponsor: { id: number } }).sponsor.id;
		const rejected = await req("POST", `/api/sponsors/${id}/reject`, {
			cookie: adminCookie,
		});
		assert.equal(rejected.status, 200);

		const list = await req("GET", "/api/sponsors");
		const raw = await list.text();
		assert.ok(!raw.includes("拒绝我"), "被拒记录不得出现在公开列表");
	});

	it("管理员可删除：删除后不出现公开列表与统计", async () => {
		// 用全新账号（用户D），避免同账号合并
		const res = await req("POST", "/api/sponsors", {
			cookie: userDCookie,
			body: { displayName: "删我", amount: 4 },
		});
		const id = ((await res.json()) as { sponsor: { id: number } }).sponsor.id;
		await req("POST", `/api/sponsors/${id}/approve`, { cookie: adminCookie });

		const del = await req("DELETE", `/api/sponsors/${id}`, {
			cookie: adminCookie,
		});
		assert.equal(del.status, 200);

		const list = await req("GET", "/api/sponsors");
		const raw = await list.text();
		assert.ok(!raw.includes("删我"), "删除后不得出现在公开列表");
		const stats = await req("GET", "/api/sponsors/stats");
		const body = (await stats.json()) as { count: number; amount: number };
		// Bob 20 + 匿名 8 + Alex 15 = 43（删我 4 已删除）
		assert.equal(body.amount, 43, "删除后统计应回落");
	});

	it("管理员可修改已通过记录：金额/昵称更新反映到列表与统计", async () => {
		// 修改 Bob(20) → 金额 30、昵称 Bob2
		const list = await req("GET", "/api/sponsors");
		const body = (await list.json()) as {
			sponsors: { id: number; displayName: string; amount: number }[];
		};
		const bob = body.sponsors.find((s) => s.displayName === "Bob")!;
		const put = await req("PUT", `/api/sponsors/${bob.id}`, {
			cookie: adminCookie,
			body: { displayName: "Bob2", amount: 30 },
		});
		assert.equal(put.status, 200);

		const stats = await req("GET", "/api/sponsors/stats");
		const statsBody = (await stats.json()) as { count: number; amount: number };
		// 30 + 匿名 8 + Alex 15 = 53
		assert.equal(statsBody.amount, 53);

		const list2 = await req("GET", "/api/sponsors");
		const body2 = (await list2.json()) as {
			sponsors: { displayName: string; amount: number }[];
		};
		assert.equal(body2.sponsors[0].displayName, "Bob2", "金额 30 应排第一");
	});

	it("提交频率超限返回 429", async () => {
		const heavyCookie = await register("heavy@example.com", "高频用户");
		let lastStatus = 0;
		for (let i = 0; i < 21; i++) {
			const res = await req("POST", "/api/sponsors", {
				cookie: heavyCookie,
				body: { displayName: "高频", amount: 1 },
			});
			lastStatus = res.status;
			if (res.status === 429) break;
		}
		assert.equal(lastStatus, 429, "第 21 次提交应被限流");
	});
});
