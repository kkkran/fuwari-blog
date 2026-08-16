import { describe, expect, it } from "vitest";
import { url } from "./url-utils";

describe("url()", () => {
	it("站内路径保持拼接行为", () => {
		expect(url("/posts/hello/")).toBe("/posts/hello/");
		expect(url("/blog/")).toBe("/blog/");
	});

	it("外链原样返回（不被拼接进站内路径）", () => {
		expect(url("https://github.com/kkkran")).toBe("https://github.com/kkkran");
		expect(url("https://space.bilibili.com/500929752")).toBe(
			"https://space.bilibili.com/500929752",
		);
	});

	it("带查询参数的站内路径正常", () => {
		expect(url("/tools/?a=1")).toBe("/tools/?a=1");
	});

	it("data:/mailto: 等协议不被破坏", () => {
		expect(url("mailto:test@example.com")).toBe("mailto:test@example.com");
		expect(url("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
	});
});
