/**
 * 写文章草稿存取（localStorage 封装）。
 *
 * - 新建态使用固定 key（NEW_DRAFT_KEY）；
 * - 编辑态按 slug 生成 key，互不污染；
 * - 存储不可用（隐私模式/配额超限/JSON 损坏）时静默降级，不影响编辑流程。
 */

export interface DraftRecord {
	/** 保存时间戳（ms） */
	savedAt: number;
	/** Markdown 正文内容 */
	content: string;
}

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const NEW_DRAFT_KEY = "blog-draft:new";

export function editDraftKey(slug: string): string {
	return `blog-draft:edit:${slug}`;
}

export function createDraftStore(storage: DraftStorage): {
	save(key: string, content: string): void;
	load(key: string): DraftRecord | null;
	clear(key: string): void;
} {
	function save(key: string, content: string): void {
		const record: DraftRecord = { savedAt: Date.now(), content };
		try {
			storage.setItem(key, JSON.stringify(record));
		} catch {
			// 存储不可用：静默失败
		}
	}

	function load(key: string): DraftRecord | null {
		try {
			const raw = storage.getItem(key);
			if (!raw) return null;
			const parsed = JSON.parse(raw) as Partial<DraftRecord>;
			if (typeof parsed.content !== "string" || typeof parsed.savedAt !== "number") {
				return null;
			}
			return { savedAt: parsed.savedAt, content: parsed.content };
		} catch {
			return null;
		}
	}

	function clear(key: string): void {
		try {
			storage.removeItem(key);
		} catch {
			// 存储不可用：静默失败
		}
	}

	return { save, load, clear };
}
