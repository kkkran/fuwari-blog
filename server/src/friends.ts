import { Router } from "express";
import type { Request as ExpressRequest } from "express";
import { db } from "./db.js";
import { requireAdmin, requireAuth } from "./middleware.js";
import { createRateLimiter } from "./rate-limit.js";

/**
 * 友链申请与审核：
 * - 登录用户提交申请（pending，等待管理员审核）；
 * - 管理员 通过/拒绝/修改/删除；
 * - 公开列表仅展示已通过记录（按通过时间倒序）。
 */

interface FriendRow {
	id: number;
	user_id: number | null;
	site_name: string;
	url: string;
	description: string;
	avatar: string;
	email: string;
	status: "pending" | "approved" | "rejected";
	source_ip: string;
	created_at: string;
	approved_at: string | null;
}

export const friendsRouter = Router();

/** 提交限流：每用户 5 分钟 5 次（防止刷申请） */
const friendSubmitLimiter = createRateLimiter({
	windowMs: 5 * 60 * 1000,
	max: 5,
	keyPrefix: "friend-submit",
	getKey: (req) =>
		String((req as Express.Request & { user?: { id: number } }).user?.id ?? req.ip),
});

/** 校验并规范化提交字段 */
function parseSubmit(
	body: unknown,
): {
	submit?: { siteName: string; url: string; description: string; avatar: string };
	error?: string;
} {
	const raw = (body ?? {}) as Record<string, unknown>;

	const siteName =
		typeof raw.siteName === "string" ? raw.siteName.replace(/[\u0000-\u001f\u007f]/g, "").trim() : "";
	if (!siteName) return { error: "请填写站点名称" };
	if (siteName.length > 40) return { error: "站点名称不能超过 40 个字符" };

	const url = typeof raw.url === "string" ? raw.url.trim() : "";
	if (!url) return { error: "请填写网站链接" };
	let parsedUrl: URL;
	try {
		parsedUrl = new URL(url);
	} catch {
		return { error: "网站链接格式不正确（需以 http/https 开头）" };
	}
	if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
		return { error: "网站链接格式不正确（需以 http/https 开头）" };
	}
	if (url.length > 300) return { error: "网站链接不能超过 300 个字符" };

	const description =
		typeof raw.description === "string" ? raw.description.trim() : "";
	if (description.length > 200) return { error: "简介不能超过 200 个字符" };

	const avatar = typeof raw.avatar === "string" ? raw.avatar.trim() : "";
	if (avatar.length > 500) return { error: "头像链接不能超过 500 个字符" };
	if (avatar && !/^https?:\/\//i.test(avatar)) {
		return { error: "头像链接需以 http/https 开头" };
	}

	return { submit: { siteName, url, description, avatar } };
}

/** 公开：已通过名单（按通过时间倒序） */
friendsRouter.get("/", (_req, res) => {
	const rows = db
		.prepare(
			`SELECT * FROM friends
       WHERE status = 'approved'
       ORDER BY approved_at DESC, id DESC`,
		)
		.all() as FriendRow[];
	res.json({
		friends: rows.map((row) => ({
			id: row.id,
			siteName: row.site_name,
			url: row.url,
			description: row.description,
			avatar: row.avatar,
			date: (row.approved_at ?? row.created_at).slice(0, 10),
		})),
	});
});

/** 管理员：待审队列（含申请者邮箱与来源 IP） */
friendsRouter.get("/pending", requireAuth, requireAdmin, (_req, res) => {
	const rows = db
		.prepare(
			`SELECT f.*, u.email AS email
       FROM friends f LEFT JOIN users u ON u.id = f.user_id
       WHERE f.status = 'pending'
       ORDER BY f.created_at DESC`,
		)
		.all() as (FriendRow & { email: string | null })[];
	res.json({
		items: rows.map((row) => ({
			id: row.id,
			siteName: row.site_name,
			url: row.url,
			description: row.description,
			avatar: row.avatar,
			email: row.email,
			sourceIp: row.source_ip,
			createdAt: row.created_at,
		})),
	});
});

/** 登录用户：提交友链申请（pending，等待管理员审核） */
friendsRouter.post("/", requireAuth, friendSubmitLimiter, (req, res) => {
	const { submit, error } = parseSubmit(req.body);
	if (error || !submit) {
		res.status(400).json({ error: error ?? "参数不完整" });
		return;
	}
	const result = db
		.prepare(
			`INSERT INTO friends
       (user_id, site_name, url, description, avatar, email, source_ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
		)
		.run(
			req.user!.id,
			submit.siteName,
			submit.url,
			submit.description,
			submit.avatar,
			req.user!.email ?? "",
			req.ip ?? "",
		);
	const row = db
		.prepare("SELECT * FROM friends WHERE id = ?")
		.get(Number(result.lastInsertRowid)) as FriendRow;
	res.status(201).json({
		friend: {
			id: row.id,
			siteName: row.site_name,
			url: row.url,
			status: row.status,
			createdAt: row.created_at,
		},
	});
});

/** 管理员：通过一条待审申请 */
friendsRouter.post("/:id/approve", requireAuth, requireAdmin, (req, res) => {
	const result = db
		.prepare(
			"UPDATE friends SET status = 'approved', approved_at = datetime('now') WHERE id = ? AND status = 'pending'",
		)
		.run(Number(req.params.id));
	if (result.changes === 0) {
		res.status(404).json({ error: "待审记录不存在" });
		return;
	}
	const row = db
		.prepare("SELECT * FROM friends WHERE id = ?")
		.get(Number(req.params.id)) as FriendRow;
	res.json({
		friend: {
			id: row.id,
			siteName: row.site_name,
			url: row.url,
			status: row.status,
		},
	});
});

/** 管理员：拒绝一条待审申请 */
friendsRouter.post("/:id/reject", requireAuth, requireAdmin, (req, res) => {
	const result = db
		.prepare(
			"UPDATE friends SET status = 'rejected' WHERE id = ? AND status = 'pending'",
		)
		.run(Number(req.params.id));
	if (result.changes === 0) {
		res.status(404).json({ error: "待审记录不存在" });
		return;
	}
	res.json({ ok: true });
});

/** 管理员：修改已通过记录（站点名/链接/简介/头像） */
friendsRouter.put("/:id", requireAuth, requireAdmin, (req, res) => {
	const row = db
		.prepare("SELECT * FROM friends WHERE id = ? AND status = 'approved'")
		.get(Number(req.params.id)) as FriendRow | undefined;
	if (!row) {
		res.status(404).json({ error: "已通过记录不存在" });
		return;
	}
	const { submit, error } = parseSubmit(req.body);
	if (error || !submit) {
		res.status(400).json({ error: error ?? "参数不完整" });
		return;
	}
	db.prepare(
		`UPDATE friends
       SET site_name = ?, url = ?, description = ?, avatar = ?
       WHERE id = ?`,
	).run(submit.siteName, submit.url, submit.description, submit.avatar, row.id);
	res.json({ ok: true });
});

/** 管理员：删除记录 */
friendsRouter.delete("/:id", requireAuth, requireAdmin, (req, res) => {
	const result = db
		.prepare("DELETE FROM friends WHERE id = ?")
		.run(Number(req.params.id));
	if (result.changes === 0) {
		res.status(404).json({ error: "记录不存在" });
		return;
	}
	res.json({ ok: true });
});
