import { Router } from "express";
import { db } from "./db.js";
import type { PostRecord } from "./types.js";

export const publicRouter = Router();

interface PostRow {
	id: number;
	slug: string;
	title: string;
	description: string;
	image: string;
	tags: string;
	content: string;
	content_preview: string | null;
	author_id: number;
	author_name: string;
	published_at: string | null;
}

function toPublicMeta(row: PostRow): Omit<PostRecord, "content"> & { contentPreview: string } {
	let tags: string[] = [];
	try {
		const parsed = JSON.parse(row.tags);
		if (Array.isArray(parsed)) {
			tags = parsed.filter((t): t is string => typeof t === "string");
		}
	} catch {
		// 忽略非法 JSON
	}
	return {
		id: row.id,
		slug: row.slug,
		title: row.title,
		description: row.description,
		image: row.image,
		tags,
		status: "approved",
		authorId: row.author_id,
		authorName: row.author_name,
		rejectReason: "",
		createdAt: row.published_at ?? "",
		updatedAt: row.published_at ?? "",
		publishedAt: row.published_at,
		contentPreview: row.content_preview ?? "",
	};
}

const SELECT = `
  SELECT p.id, p.slug, p.title, p.description, p.image, p.tags, p.content,
         substr(p.content, 1, 300) AS content_preview,
         p.author_id, u.display_name AS author_name, p.published_at
  FROM posts p
  JOIN users u ON u.id = p.author_id
  WHERE p.status = 'approved'
`;

/** 公开文章列表（仅已发布，按发布时间倒序分页） */
publicRouter.get("/posts", (req, res) => {
	const page = Math.max(1, Number(req.query.page) || 1);
	const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
	const countRow = db
		.prepare("SELECT COUNT(*) AS count FROM posts WHERE status = 'approved'")
		.get() as { count: number };
	const rows = db
		.prepare(`${SELECT} ORDER BY p.published_at DESC LIMIT ? OFFSET ?`)
		.all(pageSize, (page - 1) * pageSize) as PostRow[];
	res.json({
		items: rows.map(toPublicMeta),
		total: countRow.count,
		page,
		pageSize,
	});
});

/** 公开文章详情（仅已发布） */
publicRouter.get("/posts/:slug", (req, res) => {
	const row = db
		.prepare(`${SELECT} AND p.slug = ?`)
		.get(req.params.slug) as PostRow | undefined;
	if (!row) {
		res.status(404).json({ error: "文章不存在" });
		return;
	}
	const meta = toPublicMeta(row);
	res.json({ post: { ...meta, content: row.content } });
});
