/**
 * oneimg 客户端（上传脚本核心）单元测试（vitest）
 *
 * 注入 fetch 模拟 oneimg 服务器，验证登录与上传的请求构造、
 * 成功返回绝对 URL、失败时抛出可读错误（脚本场景需要明确失败）。
 */
import { describe, expect, it } from "vitest";

const { loginToOneimg, uploadImageToOneimg } = await import(
	"./oneimg-client.js"
);

const baseUrl = "http://127.0.0.1:8080";

function jsonResponse(
	body,
	status = 200,
	headers = {},
) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
}

function makeFakeFetch(handler) {
	return async (input, init) => handler(String(input), init);
}

describe("loginToOneimg", () => {
	it("登录成功返回会话 cookie", async () => {
		const fetchImpl = makeFakeFetch((url, init) => {
			expect(url).toBe(`${baseUrl}/api/login`);
			expect(init.method).toBe("POST");
			expect(JSON.parse(init.body)).toEqual({
				username: "kkkran",
				password: "secret",
			});
			return jsonResponse(
				{ code: 200, message: "登录成功", data: { token: "T" } },
				200,
				{ "set-cookie": "oneimg-session=COOKIE; Path=/; HttpOnly" },
			);
		});
		const cookie = await loginToOneimg(
			{ baseUrl, username: "kkkran", password: "secret" },
			fetchImpl,
		);
		expect(cookie).toBe("oneimg-session=COOKIE");
	});

	it("业务失败（凭证错误）时抛出可读错误", async () => {
		const fetchImpl = makeFakeFetch(() =>
			jsonResponse({ code: 401, message: "用户名或密码错误" }),
		);
		await expect(
			loginToOneimg({ baseUrl, username: "x", password: "y" }, fetchImpl),
		).rejects.toThrow(/用户名或密码错误/);
	});

	it("HTTP 错误时抛出错误", async () => {
		const fetchImpl = makeFakeFetch(() => jsonResponse({ error: "boom" }, 500));
		await expect(
			loginToOneimg({ baseUrl, username: "x", password: "y" }, fetchImpl),
		).rejects.toThrow();
	});

	it("响应缺少会话 cookie 时抛出错误", async () => {
		const fetchImpl = makeFakeFetch(() =>
			jsonResponse({ code: 200, message: "登录成功", data: { token: "T" } }),
		);
		await expect(
			loginToOneimg({ baseUrl, username: "x", password: "y" }, fetchImpl),
		).rejects.toThrow(/cookie/i);
	});
});

describe("uploadImageToOneimg", () => {
	const file = {
		name: "photo.png",
		mimetype: "image/png",
		buffer: Buffer.from("fake-png"),
	};

	it("上传成功返回图床绝对 URL 与 id", async () => {
		const fetchImpl = makeFakeFetch((url, init) => {
			expect(url).toBe(`${baseUrl}/api/upload`);
			expect(init.method).toBe("POST");
			expect(new Headers(init.headers).get("cookie")).toBe(
				"oneimg-session=COOKIE",
			);
			expect(init.body).toBeInstanceOf(FormData);
			return jsonResponse({
				code: 200,
				message: "上传成功",
				data: {
					count: 1,
					files: [{ id: 7, url: "/uploads/2026/08/x.webp" }],
				},
			});
		});
		const result = await uploadImageToOneimg(
			{ baseUrl, cookie: "oneimg-session=COOKIE" },
			file,
			fetchImpl,
		);
		expect(result).toEqual({
			url: "http://127.0.0.1:8080/uploads/2026/08/x.webp",
			id: 7,
		});
	});

	it("业务失败时抛出可读错误", async () => {
		const fetchImpl = makeFakeFetch(() =>
			jsonResponse({ code: 400, message: "文件解析失败" }),
		);
		await expect(
			uploadImageToOneimg({ baseUrl, cookie: "c" }, file, fetchImpl),
		).rejects.toThrow(/文件解析失败/);
	});

	it("响应缺少文件信息时抛出错误", async () => {
		const fetchImpl = makeFakeFetch(() =>
			jsonResponse({ code: 200, message: "上传成功", data: { files: [] } }),
		);
		await expect(
			uploadImageToOneimg({ baseUrl, cookie: "c" }, file, fetchImpl),
		).rejects.toThrow();
	});
});
