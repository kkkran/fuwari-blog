import { describe, expect, it } from "vitest";
import type { CollectionEntry } from "astro:content";
import {
	computePrevNext,
	mergeSortedPosts,
	type DbPostMetaLike,
	type MergedPost,
} from "./post-sorting";

function mdPost(
	id: string,
	published: string,
	pinned = false,
): CollectionEntry<"posts"> {
	return {
		id,
		slug: id,
		body: "",
		collection: "posts",
		render: undefined,
		data: {
			title: `标题 ${id}`,
			published: new Date(published),
			pinned,
			draft: false,
		},
	} as unknown as CollectionEntry<"posts">;
}

function dbPost(slug: string, published: string): DbPostMetaLike {
	return {
		slug,
		title: `DB ${slug}`,
		publishedAt: published,
		pinned: false,
	};
}

describe("mergeSortedPosts", () => {
	it("md 与 db 按 published 倒序合并", () => {
		const merged = mergeSortedPosts({
			mdPosts: [mdPost("md-old", "2026-01-01"), mdPost("md-mid", "2026-02-01")],
			dbPosts: [dbPost("db-new", "2026-03-01")],
		});
		expect(merged.map((p) => p.slug)).toEqual([
			"db-new",
			"md-mid",
			"md-old",
		]);
		expect(merged[0].source).toBe("db");
		expect(merged[0].title).toBe("DB db-new");
	});

	it("空 db 时退回纯 md", () => {
		const merged = mergeSortedPosts({
			mdPosts: [mdPost("a", "2026-01-01"), mdPost("b", "2026-02-01")],
			dbPosts: [],
		});
		expect(merged.map((p) => p.slug)).toEqual(["b", "a"]);
	});

	it("同日期时排序稳定不崩", () => {
		const merged = mergeSortedPosts({
			mdPosts: [mdPost("m1", "2026-01-01"), mdPost("m2", "2026-01-01")],
			dbPosts: [dbPost("d1", "2026-01-01")],
		});
		expect(merged).toHaveLength(3);
	});

	it("db 的 publishedAt 为空时按 1970 处理排最后", () => {
		const merged = mergeSortedPosts({
			mdPosts: [mdPost("m1", "2026-01-01")],
			dbPosts: [{ slug: "d-old", title: "old", publishedAt: null, pinned: false }],
		});
		expect(merged.map((p) => p.slug)).toEqual(["m1", "d-old"]);
	});
});

describe("computePrevNext", () => {
	it("上一篇为更新的文章，下一篇为更旧的", () => {
		const merged: MergedPost[] = [
			{ slug: "c", title: "C", published: new Date("2026-03-01"), source: "db", pinned: false },
			{ slug: "b", title: "B", published: new Date("2026-02-01"), source: "md", pinned: false },
			{ slug: "a", title: "A", published: new Date("2026-01-01"), source: "md", pinned: false },
		];
		expect(computePrevNext(merged, "b")).toEqual({
			prev: { slug: "c", title: "C" },
			next: { slug: "a", title: "A" },
		});
	});

	it("最上一篇没有 prev，最末一篇没有 next", () => {
		const merged: MergedPost[] = [
			{ slug: "b", title: "B", published: new Date("2026-02-01"), source: "md", pinned: false },
			{ slug: "a", title: "A", published: new Date("2026-01-01"), source: "db", pinned: false },
		];
		expect(computePrevNext(merged, "b")).toEqual({ prev: null, next: { slug: "a", title: "A" } });
		expect(computePrevNext(merged, "a")).toEqual({ prev: { slug: "b", title: "B" }, next: null });
	});

	it("未找到当前 slug 时返回空前后篇", () => {
		const merged: MergedPost[] = [
			{ slug: "b", title: "B", published: new Date("2026-02-01"), source: "md", pinned: false },
		];
		expect(computePrevNext(merged, "not-exist")).toEqual({ prev: null, next: null });
	});

	it("单篇时 prev 与 next 均为空", () => {
		const merged: MergedPost[] = [
			{ slug: "only", title: "Only", published: new Date("2026-02-01"), source: "md", pinned: false },
		];
		expect(computePrevNext(merged, "only")).toEqual({ prev: null, next: null });
	});
});
