import { describe, expect, it } from "vitest";
import { computeRelatedPosts, type RelatedPostSource } from "./related-posts";

function post(slug: string, tags: string[], published = "2026-01-01"): RelatedPostSource {
	return { slug, title: slug, tags, published: new Date(published) };
}

const all: RelatedPostSource[] = [
	post("a", ["astro", "部署"], "2026-01-01"),
	post("b", ["astro"], "2026-02-01"),
	post("c", ["部署", "docker"], "2026-03-01"),
	post("d", ["python"], "2026-04-01"),
	post("e", [], "2026-05-01"),
	post("f", ["astro", "部署", "docker"], "2026-06-01"),
];

describe("computeRelatedPosts", () => {
	it("排除当前文章自身", () => {
		const result = computeRelatedPosts(post("a", ["astro", "部署"]), all, 3);
		expect(result.map((p) => p.slug)).not.toContain("a");
	});

	it("标签重合最多的排最前", () => {
		const result = computeRelatedPosts(post("a", ["astro", "部署"]), all, 3);
		// f 与 a 重合 2 个标签（astro、部署），应排第一
		expect(result[0].slug).toBe("f");
		// 其次 c 或 b（重合 1 个，平局按发布时间新的在前 → c）
		expect(result.slice(0, 2).map((p) => p.slug)).toEqual(["f", "c"]);
	});

	it("数量受 count 限制", () => {
		const result = computeRelatedPosts(post("a", ["astro", "部署"]), all, 2);
		expect(result).toHaveLength(2);
	});

	it("无标签重合时按发布时间最新的排前", () => {
		const result = computeRelatedPosts(post("d", ["python"]), all, 3);
		expect(result.map((p) => p.slug)).toEqual(["f", "e", "c"]);
	});

	it("候选不足时返回可用的全部", () => {
		const result = computeRelatedPosts(post("x", []), [post("y", [])], 3);
		expect(result).toHaveLength(1);
		expect(result[0].slug).toBe("y");
	});

	it("无候选时返回空数组", () => {
		expect(computeRelatedPosts(post("x", []), [], 3)).toEqual([]);
	});
});
