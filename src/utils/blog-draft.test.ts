import { describe, expect, it } from "vitest";
import {
	NEW_DRAFT_KEY,
	createDraftStore,
	editDraftKey,
	type DraftStorage,
} from "./blog-draft";

function createMemoryStorage(): DraftStorage & { data: Map<string, string> } {
	const data = new Map<string, string>();
	return {
		data,
		getItem(key: string) {
			return data.get(key) ?? null;
		},
		setItem(key: string, value: string) {
			data.set(key, value);
		},
		removeItem(key: string) {
			data.delete(key);
		},
	};
}

describe("blog-draft", () => {
	it("保存后可读回相同内容与保存时间", () => {
		const store = createDraftStore(createMemoryStorage());
		store.save(NEW_DRAFT_KEY, "# 草稿内容");
		const record = store.load(NEW_DRAFT_KEY);
		expect(record).not.toBeNull();
		expect(record!.content).toBe("# 草稿内容");
		expect(typeof record!.savedAt).toBe("number");
		expect(record!.savedAt).toBeGreaterThan(0);
	});

	it("清除后读取为 null", () => {
		const store = createDraftStore(createMemoryStorage());
		store.save(NEW_DRAFT_KEY, "内容");
		store.clear(NEW_DRAFT_KEY);
		expect(store.load(NEW_DRAFT_KEY)).toBeNull();
	});

	it("不同 key 互不污染", () => {
		const store = createDraftStore(createMemoryStorage());
		store.save(NEW_DRAFT_KEY, "新文章草稿");
		store.save(editDraftKey("hello-world"), "编辑草稿");
		expect(store.load(NEW_DRAFT_KEY)!.content).toBe("新文章草稿");
		expect(store.load(editDraftKey("hello-world"))!.content).toBe("编辑草稿");
		expect(store.load(editDraftKey("other"))).toBeNull();
	});

	it("读取不存在的 key 返回 null", () => {
		const store = createDraftStore(createMemoryStorage());
		expect(store.load("no-such-key")).toBeNull();
	});

	it("损坏的 JSON 返回 null 且不抛异常", () => {
		const storage = createMemoryStorage();
		storage.data.set(NEW_DRAFT_KEY, "{not-json");
		const store = createDraftStore(storage);
		expect(() => store.load(NEW_DRAFT_KEY)).not.toThrow();
		expect(store.load(NEW_DRAFT_KEY)).toBeNull();
	});

	it("结构不符的记录（缺字段）返回 null", () => {
		const storage = createMemoryStorage();
		storage.data.set(NEW_DRAFT_KEY, JSON.stringify({ content: "只有内容" }));
		const store = createDraftStore(storage);
		expect(store.load(NEW_DRAFT_KEY)).toBeNull();
	});

	it("保存写入的 JSON 含 savedAt 与 content 字段", () => {
		const storage = createMemoryStorage();
		createDraftStore(storage).save(NEW_DRAFT_KEY, "正文");
		const raw = storage.data.get(NEW_DRAFT_KEY)!;
		const parsed = JSON.parse(raw) as { savedAt: number; content: string };
		expect(parsed.content).toBe("正文");
		expect(typeof parsed.savedAt).toBe("number");
	});

	it("key 工厂：新建固定 key，编辑态按 slug", () => {
		expect(NEW_DRAFT_KEY).toBe("blog-draft:new");
		expect(editDraftKey("my-post")).toBe("blog-draft:edit:my-post");
	});

	it("写入失败时静默（不抛异常）", () => {
		const failing: DraftStorage = {
			getItem: () => null,
			setItem: () => {
				throw new Error("QuotaExceededError");
			},
			removeItem: () => {},
		};
		const store = createDraftStore(failing);
		expect(() => store.save(NEW_DRAFT_KEY, "内容")).not.toThrow();
	});
});
