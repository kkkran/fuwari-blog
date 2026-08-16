import { describe, expect, it } from "vitest";
import { collectTagCounts, postsForTag } from "./tag-utils";

const posts = [
	{ slug: "a", tags: ["astro", "部署"] },
	{ slug: "b", tags: ["astro"] },
	{ slug: "c", tags: ["部署", "docker"] },
	{ slug: "d", tags: [] },
] as { slug: string; tags: string[] }[];

describe("collectTagCounts", () => {
	it("统计每个标签的文章数并按数量降序", () => {
		const counts = collectTagCounts(posts);
		expect(counts).toEqual([
			{ tag: "astro", count: 2 },
			{ tag: "部署", count: 2 },
			{ tag: "docker", count: 1 },
		]);
	});

	it("数量相同时按标签名排序", () => {
		const counts = collectTagCounts(posts);
		expect(counts[0].tag).toBe("astro");
		expect(counts[1].tag).toBe("部署");
	});

	it("无标签时返回空数组", () => {
		expect(collectTagCounts([{ slug: "x", tags: [] }])).toEqual([]);
	});
});

describe("postsForTag", () => {
	it("返回包含指定标签的文章（不含无标签项）", () => {
		const result = postsForTag(posts, "部署");
		expect(result.map((p) => p.slug)).toEqual(["a", "c"]);
	});

	it("不存在的标签返回空数组", () => {
		expect(postsForTag(posts, "不存在的标签")).toEqual([]);
	});
});
