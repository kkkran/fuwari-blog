import { describe, expect, it } from "vitest";
import {
	collectPostUrlsFromGit,
	extractSlugFromPath,
	normalizeKey,
	toIndexNowPayload,
} from "./indexnow-lib";

describe("IndexNow 工具", () => {
	it("从文章文件路径提取 slug", () => {
		expect(extractSlugFromPath("src/content/posts/hello-world.md")).toBe("hello-world");
		expect(extractSlugFromPath("src/content/posts/子目录/我的文章.md")).toBe("我的文章");
		expect(extractSlugFromPath("scripts/other.js")).toBeNull();
	});

	it("key 规范化：trim 且验证 32 位 hex", () => {
		expect(normalizeKey("  a1b2c3d4e5f60718293a4b5c6d7e8f90  ")).toBe(
			"a1b2c3d4e5f60718293a4b5c6d7e8f90",
		);
		expect(() => normalizeKey("too-short")).toThrow();
		expect(() => normalizeKey("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz")).toThrow();
	});

	it("构造 IndexNow 请求体", () => {
		const payload = toIndexNowPayload({
			host: "miscoke.top",
			key: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
			urls: ["https://miscoke.top/posts/a/", "https://miscoke.top/posts/b/"],
		});
		expect(payload.host).toBe("miscoke.top");
		expect(payload.key).toBe("a1b2c3d4e5f60718293a4b5c6d7e8f90");
		expect(payload.keyLocation).toBe(
			"https://miscoke.top/a1b2c3d4e5f60718293a4b5c6d7e8f90.txt",
		);
		expect(payload.urlList).toHaveLength(2);
	});

	it("git 提交文件列表中提取文章 URL（含新增与修改）", () => {
		const files = [
			"src/content/posts/new-post.md",
			"src/content/posts/updated.md",
			"src/other/file.ts",
			"public/logo.png",
		];
		const urls = collectPostUrlsFromGit(files, "https://miscoke.top");
		expect(urls).toEqual([
			"https://miscoke.top/posts/new-post/",
			"https://miscoke.top/posts/updated/",
		]);
	});
});
