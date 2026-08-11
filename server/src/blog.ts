import { Router } from "express";
import { db } from "./db.js";
import { requireAdmin, requireAuth } from "./middleware.js";
import { createNotification } from "./notifications.js";
import type { PostDraft, PostRecord, PostStatus } from "./types.js";

export const blogRouter = Router();

// ---------- 工具 ----------

interface PostRow {
	id: number;
	slug: string;
	title: string;
	description: string;
	image: string;
	tags: string;
	content: string;
	status: PostStatus;
	author_id: number;
	author_name: string;
	reject_reason: string;
	created_at: string;
	updated_at: string;
	published_at: string | null;
}

const POST_SELECT = `
  SELECT p.*, u.display_name AS author_name
  FROM posts p
  JOIN users u ON u.id = p.author_id
`;

function toPost(row: PostRow): PostRecord {
	let tags: string[] = [];
	try {
		const parsed = JSON.parse(row.tags);
		if (Array.isArray(parsed)) {
			tags = parsed.filter((t): t is string => typeof t === "string");
		}
	} catch {
		// 非法 JSON 视为空标签
	}
	return {
		id: row.id,
		slug: row.slug,
		title: row.title,
		description: row.description,
		image: row.image,
		tags,
		content: row.content,
		status: row.status,
		authorId: row.author_id,
		authorName: row.author_name,
		rejectReason: row.reject_reason,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		publishedAt: row.published_at,
	};
}

/** 校验并规范化投稿字段；失败返回错误信息 */
function parseDraft(body: unknown): { draft?: PostDraft; error?: string } {
	const raw = (body ?? {}) as Record<string, unknown>;
	const title = typeof raw.title === "string" ? raw.title.trim() : "";
	if (!title) return { error: "标题不能为空" };
	if (title.length > 120) return { error: "标题不能超过 120 字" };
	const content = typeof raw.content === "string" ? raw.content : "";
	if (!content.trim()) return { error: "正文不能为空" };

	let slug = typeof raw.slug === "string" ? raw.slug.trim().toLowerCase() : "";
	if (!slug) {
		slug = title
			.toLowerCase()
			.replace(/[^\p{L}\p{N}]+/gu, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 100);
	}
	if (!/^[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,98}[\p{L}\p{N}])?$/u.test(slug)) {
		return { error: "slug 只能包含字母、数字、连字符（-）" };
	}

	const description =
		typeof raw.description === "string" ? raw.description.trim().slice(0, 300) : "";
	const image = typeof raw.image === "string" ? raw.image.trim().slice(0, 500) : "";
	const tagsRaw = Array.isArray(raw.tags) ? raw.tags : [];
	const tags = tagsRaw
		.filter((t): t is string => typeof t === "string")
		.map((t) => t.trim())
		.filter(Boolean)
		.slice(0, 10);

	return {
		draft: { slug, title, description, image, tags, content },
	};
}

function slugExists(slug: string, excludeId?: number): boolean {
	const row = excludeId
		? db
				.prepare("SELECT id FROM posts WHERE slug = ? AND id != ?")
				.get(slug, excludeId)
		: db.prepare("SELECT id FROM posts WHERE slug = ?").get(slug);
	return Boolean(row);
}

// ---------- 作者侧 ----------

/** 提交新文章（status=pending） */
blogRouter.post("/posts", requireAuth, (req, res) => {
	const { draft, error } = parseDraft(req.body);
	if (error || !draft) {
		res.status(400).json({ error: error ?? "参数不完整" });
		return;
	}
	if (slugExists(draft.slug)) {
		res.status(409).json({ error: "slug 已被占用，请更换" });
		return;
	}
	const result = db
		.prepare(
			`INSERT INTO posts (slug, title, description, image, tags, content, status, author_id)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
		)
		.run(
			draft.slug,
			draft.title,
			draft.description,
			draft.image,
			JSON.stringify(draft.tags),
			draft.content,
			req.user!.id,
		);
	const row = db
		.prepare(`${POST_SELECT} WHERE p.id = ?`)
		.get(Number(result.lastInsertRowid)) as PostRow;
	res.status(201).json({ post: toPost(row) });
});

/** 修改文章：已发布 → 重新待审核；待审核/已拒绝 → 更新草稿 */
blogRouter.put("/posts/:slug", requireAuth, (req, res) => {
	const slug = req.params.slug;
	const row = db.prepare(`${POST_SELECT} WHERE p.slug = ?`).get(slug) as
		| PostRow
		| undefined;
	if (!row) {
		res.status(404).json({ error: "文章不存在" });
		return;
	}
	if (row.author_id !== req.user!.id) {
		res.status(403).json({ error: "只能修改自己的文章" });
		return;
	}
	const { draft, error } = parseDraft(req.body);
	if (error || !draft) {
		res.status(400).json({ error: error ?? "参数不完整" });
		return;
	}
	if (slugExists(draft.slug, row.id)) {
		res.status(409).json({ error: "slug 已被占用，请更换" });
		return;
	}
	// 修改已发布文章 → 回到待审核；修改待审核/已拒绝 → 仍是待审核
	const nextStatus: PostStatus =
		row.status === "approved" ? "pending" : row.status === "rejected" ? "pending" : "pending";
	db.prepare(
		`UPDATE posts
     SET slug = ?, title = ?, description = ?, image = ?, tags = ?, content = ?,
         status = ?, reject_reason = '', updated_at = datetime('now')
     WHERE id = ?`,
	).run(
		draft.slug,
		draft.title,
		draft.description,
		draft.image,
		JSON.stringify(draft.tags),
		draft.content,
		nextStatus,
		row.id,
	);
	const updated = db
		.prepare(`${POST_SELECT} WHERE p.id = ?`)
		.get(row.id) as PostRow;
	res.json({ post: toPost(updated) });
});

/** 我的文章列表（含审核状态） */
blogRouter.get("/posts/mine", requireAuth, (req, res) => {
	const rows = db
		.prepare(`${POST_SELECT} WHERE p.author_id = ? ORDER BY p.updated_at DESC`)
		.all(req.user!.id) as PostRow[];
	res.json({ items: rows.map(toPost) });
});

/** 查看自己的文章全文 */
blogRouter.get("/posts/:slug", requireAuth, (req, res) => {
	const row = db.prepare(`${POST_SELECT} WHERE p.slug = ?`).get(req.params.slug) as
		| PostRow
		| undefined;
	if (!row) {
		res.status(404).json({ error: "文章不存在" });
		return;
	}
	if (row.author_id !== req.user!.id && req.user!.role !== "admin") {
		res.status(403).json({ error: "无权查看" });
		return;
	}
	res.json({ post: toPost(row) });
});

/** 撤回/删除（仅 pending/rejected） */
blogRouter.delete("/posts/:slug", requireAuth, (req, res) => {
	const row = db.prepare("SELECT * FROM posts WHERE slug = ?").get(req.params.slug) as
		| { id: number; author_id: number; status: PostStatus }
		| undefined;
	if (!row) {
		res.status(404).json({ error: "文章不存在" });
		return;
	}
	if (row.author_id !== req.user!.id && req.user!.role !== "admin") {
		res.status(403).json({ error: "无权删除" });
		return;
	}
	if (row.status === "approved") {
		res.status(400).json({ error: "已发布文章不支持在线删除" });
		return;
	}
	db.prepare("DELETE FROM posts WHERE id = ?").run(row.id);
	res.json({ ok: true });
});

// ---------- admin 侧 ----------

/** 审核列表（可按 status 筛选，默认 pending） */
blogRouter.get("/posts", requireAuth, requireAdmin, (req, res) => {
	const status =
		typeof req.query.status === "string" &&
		["pending", "approved", "rejected"].includes(req.query.status)
			? (req.query.status as PostStatus)
			: "pending";
	const rows = db
		.prepare(`${POST_SELECT} WHERE p.status = ? ORDER BY p.updated_at DESC`)
		.all(status) as PostRow[];
	res.json({ items: rows.map(toPost) });
});

/** 审核通过（首次通过设置 published_at，重审通过保留原发布时间） */
blogRouter.post("/posts/:slug/approve", requireAuth, requireAdmin, (req, res) => {
	const row = db
		.prepare("SELECT * FROM posts WHERE slug = ?")
		.get(req.params.slug) as { id: number; title: string; author_id: number } | undefined;
	if (!row) {
		res.status(404).json({ error: "文章不存在" });
		return;
	}
	const publishedAt = db
		.prepare("SELECT published_at FROM posts WHERE id = ?")
		.get(row.id) as { published_at: string | null };
	const publishedAtValue =
		publishedAt.published_at ?? new Date().toISOString().replace("T", " ").slice(0, 19);
	db.prepare(
		`UPDATE posts SET status = 'approved', reject_reason = '', published_at = ?,
         updated_at = datetime('now') WHERE id = ?`,
	).run(publishedAtValue, row.id);
	createNotification(row.author_id, "review_result", `你的文章《${row.title}》已审核通过并公开`);
	res.json({ ok: true });
});

/** 审核拒绝（附原因） */
blogRouter.post("/posts/:slug/reject", requireAuth, requireAdmin, (req, res) => {
	const row = db
		.prepare("SELECT * FROM posts WHERE slug = ?")
		.get(req.params.slug) as { id: number; title: string; author_id: number } | undefined;
	if (!row) {
		res.status(404).json({ error: "文章不存在" });
		return;
	}
	const reason =
		typeof (req.body ?? {}).reason === "string"
			? (req.body as { reason: string }).reason.trim().slice(0, 500)
			: "";
	db.prepare(
		`UPDATE posts SET status = 'rejected', reject_reason = ?,
         updated_at = datetime('now') WHERE id = ?`,
	).run(reason, row.id);
	createNotification(
		row.author_id,
		"review_result",
		`你的文章《${row.title}》未通过审核${reason ? `：${reason}` : ""}`,
	);
	res.json({ ok: true });
});
