/**
 * 图床客户端（image-hosting）单元测试（node:test + tsx）
 *
 * 通过注入 fetch 模拟 oneimg 服务器行为，验证：
 * 登录请求构造、会话 cookie 复用、上传请求构造、
 * 成功返回图床 URL、登录/上传失败返回 null（触发本地回退）。
 *
 * 运行：pnpm test（或 tsx --test test/image-hosting.test.ts）
 */
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

// 必须在导入任何 server 模块前设置（dotenv 不覆盖已存在的环境变量）
process.env.IMAGE_HOSTING_ENABLED = "true";
process.env.IMAGE_HOSTING_BASE_URL = "http://127.0.0.1:8080";
process.env.IMAGE_HOSTING_USERNAME = "test-user";
process.env.IMAGE_HOSTING_PASSWORD = "test-pass";

const { uploadToImageHosting, resetImageHostingSession } = await import(
	"../src/image-hosting.js"
);
const { config } = await import("../src/config.js");

beforeEach(() => {
	resetImageHostingSession();
});

const sampleFile = {
	originalname: "photo.png",
	mimetype: "image/png",
	buffer: Buffer.from("fake-png-bytes"),
};

function jsonResponse(
	body: unknown,
	status = 200,
	headers: Record<string, string> = {},
): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
}

type FetchCall = { url: string; init?: RequestInit };

function makeFakeFetch(
	handler: (call: FetchCall) => Response,
): { fetchImpl: typeof fetch; calls: FetchCall[] } {
	const calls: FetchCall[] = [];
	const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
		const call: FetchCall = { url: String(input), init };
		calls.push(call);
		return handler(call);
	}) as typeof fetch;
	return { fetchImpl, calls };
}

function requestHeaders(init?: RequestInit): Headers {
	return new Headers(init?.headers);
}

function loginOkResponse() {
	return jsonResponse(
		{ code: 200, message: "登录成功", data: { token: "SESSION-TOKEN" } },
		200,
		{ "set-cookie": "oneimg-session=SESSION-COOKIE; Path=/; HttpOnly; Max-Age=86400" },
	);
}

function uploadOkResponse() {
	return jsonResponse({
		code: 200,
		message: "上传成功",
		data: {
			count: 1,
			files: [
				{
					success: true,
					id: 42,
					url: "/uploads/2026/08/abc123.webp",
					thumbnail_url: "/uploads/2026/08/thumbnails/abc123.webp",
					mime_type: "image/webp",
				},
			],
		},
	});
}

afterEach(() => {
	config.imageHosting.enabled = true;
});

describe("uploadToImageHosting", () => {
	it("禁用图床时直接返回 null 且不发任何请求", async () => {
		config.imageHosting.enabled = false;
		const { fetchImpl, calls } = makeFakeFetch(() => {
			throw new Error("不应发起请求");
		});
		const result = await uploadToImageHosting(sampleFile, fetchImpl);
		assert.equal(result, null);
		assert.equal(calls.length, 0);
	});

	it("登录成功后上传，携带会话 cookie，返回图床绝对 URL", async () => {
		let loginCount = 0;
		const { fetchImpl, calls } = makeFakeFetch((call) => {
			if (call.url.endsWith("/api/login")) {
				loginCount++;
				const body = JSON.parse(String(call.init?.body));
				assert.deepEqual(body, {
					username: "test-user",
					password: "test-pass",
				});
				assert.equal(call.init?.method, "POST");
				assert.ok(
					requestHeaders(call.init)
						.get("content-type")
						?.includes("application/json"),
					"登录请求应带 JSON Content-Type",
				);
				return loginOkResponse();
			}
			assert.equal(call.url, "http://127.0.0.1:8080/api/upload");
			assert.equal(call.init?.method, "POST");
			assert.ok(call.init?.body instanceof FormData, "上传请求体应为 FormData");
			assert.ok(
				requestHeaders(call.init)
					.get("cookie")
					?.includes("oneimg-session=SESSION-COOKIE"),
				"上传请求应携带会话 cookie",
			);
			return uploadOkResponse();
		});

		const result = await uploadToImageHosting(sampleFile, fetchImpl);

		assert.deepEqual(result, {
			url: "http://127.0.0.1:8080/uploads/2026/08/abc123.webp",
			id: 42,
		});
		assert.equal(loginCount, 1, "仅首次上传应触发登录");
		assert.equal(calls.length, 2);
	});

	it("同一会话连续上传只登录一次（复用 cookie）", async () => {
		let loginCount = 0;
		const { fetchImpl } = makeFakeFetch((call) => {
			if (call.url.endsWith("/api/login")) {
				loginCount++;
				return loginOkResponse();
			}
			return uploadOkResponse();
		});

		await uploadToImageHosting(sampleFile, fetchImpl);
		await uploadToImageHosting(sampleFile, fetchImpl);

		assert.equal(loginCount, 1, "第二次上传应复用已登录的会话 cookie");
	});

	it("登录失败（凭证错误）时返回 null", async () => {
		const { fetchImpl } = makeFakeFetch(() =>
			jsonResponse({ code: 401, message: "用户名或密码错误" }, 200),
		);
		const result = await uploadToImageHosting(sampleFile, fetchImpl);
		assert.equal(result, null);
	});

	it("登录接口 HTTP 错误时返回 null", async () => {
		const { fetchImpl } = makeFakeFetch(() => jsonResponse({ error: "boom" }, 500));
		const result = await uploadToImageHosting(sampleFile, fetchImpl);
		assert.equal(result, null);
	});

	it("上传接口业务失败（code!=200）时返回 null", async () => {
		const { fetchImpl } = makeFakeFetch((call) =>
			call.url.endsWith("/api/login")
				? loginOkResponse()
				: jsonResponse({ code: 400, message: "文件解析失败" }, 200),
		);
		const result = await uploadToImageHosting(sampleFile, fetchImpl);
		assert.equal(result, null);
	});

	it("上传响应缺少 files 时返回 null", async () => {
		const { fetchImpl } = makeFakeFetch((call) =>
			call.url.endsWith("/api/login")
				? loginOkResponse()
				: jsonResponse({ code: 200, message: "上传成功", data: { count: 0, files: [] } }),
		);
		const result = await uploadToImageHosting(sampleFile, fetchImpl);
		assert.equal(result, null);
	});

	it("登录接口网络异常（fetch 抛错）时返回 null 且不影响后续调用", async () => {
		let fail = true;
		const { fetchImpl } = makeFakeFetch((call) => {
			if (call.url.endsWith("/api/login")) {
				if (fail) {
					fail = false;
					throw new TypeError("fetch failed");
				}
				return loginOkResponse();
			}
			return uploadOkResponse();
		});

		const first = await uploadToImageHosting(sampleFile, fetchImpl);
		assert.equal(first, null, "网络异常应视为图床不可用");
		const second = await uploadToImageHosting(sampleFile, fetchImpl);
		assert.equal(second?.url, "http://127.0.0.1:8080/uploads/2026/08/abc123.webp");
	});
});
