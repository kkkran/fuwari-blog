import { describe, expect, it } from "vitest";
import { toCollectionEntry } from "./blog-db";

function dbPost(overrides: Record<string, unknown> = {}) {
	return {
		id: 1,
		slug: "hello",
		title: "你好",
		description: "",
		image: "",
		content: "",
		status: "approved",
		authorId: 1,
		authorName: "作者",
		rejectReason: "",
		createdAt: "2026-01-01 00:00:00",
		updatedAt: "2026-01-01 00:00:00",
		publishedAt: null,
		tags: ["astro"],
		...overrides,
	};
}

describe("toCollectionEntry", () => {
	it("tags 为数组时原样保留", () => {
		const entry = toCollectionEntry(dbPost() as never);
		expect(entry.data.tags).toEqual(["astro"]);
	});

	it("tags 为 null 时规范为空数组", () => {
		const entry = toCollectionEntry(dbPost({ tags: null }) as never);
		expect(entry.data.tags).toEqual([]);
	});

	it("tags 为 undefined 时规范为空数组", () => {
		const entry = toCollectionEntry(dbPost({ tags: undefined }) as never);
		expect(entry.data.tags).toEqual([]);
	});

	it("基本字段映射正确", () => {
		const entry = toCollectionEntry(dbPost() as never);
		expect(entry.id).toBe("hello");
		expect(entry.data.title).toBe("你好");
		expect(entry.__source).toBe("db");
	});
});
