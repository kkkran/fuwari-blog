/**
 * 赞助登记与审核 API。
 *
 * 流程：登录用户提交（pending）→ 管理员通过/拒绝 → 公开列表即时可见。
 * 同账号重复赞助：通过时合并进该账号已通过记录（金额累计，昵称/匿名取最新）。
 * 匿名赞助：公开列表统一打码为"匿名用户"。
 */
import { Router } from "express";
import { db } from "./db.js";
import { requireAdmin, requireAuth } from "./middleware.js";
import { createRateLimiter } from "./rate-limit.js";

export const sponsorsRouter = Router();

/** 提交限流（requireAuth 之后按登录用户计数） */
const sponsorSubmitLimiter = createRateLimiter({
	windowMs: 5 * 60 * 1000,
	max: 20,
	keyPrefix: "sponsor-submit",
	getKey: (req) => String(req.user!.id),
});

interface SponsorRow {
	id: number;
	user_id: number | null;
	display_name: string;
	avatar_url: string;
	amount: number;
	amount_text: string;
	anonymous: number;
	remark: string;
	status: "pending" | "approved" | "rejected";
	source_ip: string;
	created_at: string;
	approved_at: string | null;
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

/** 公开展示形态（匿名打码，日期取通过时间） */
function toPublic(row: SponsorRow) {
	return {
		id: row.id,
		displayName: row.anonymous ? "匿名用户" : row.display_name,
		avatarUrl: row.anonymous ? null : row.avatar_url || null,
		amount: round2(row.amount),
		amountText: row.amount_text,
		anonymous: Boolean(row.anonymous),
		date: (row.approved_at ?? row.created_at).slice(0, 10),
	};
}

/** 校验并规范化提交字段；失败返回错误信息 */
function parseSubmit(body: unknown): { submit?: { displayName: string; amount: number; anonymous: boolean; remark: string }; error?: string } {
	const raw = (body ?? {}) as Record<string, unknown>;

	const displayName =
		typeof raw.displayName === "string"
			? raw.displayName.replace(/[\u0000-\u001f\u007f]/g, "").trim()
			: "";
	if (!displayName) return { error: "昵称不能为空" };
	if (displayName.length > 24) return { error: "昵称不能超过 24 个字符" };

	let amount: number;
	if (typeof raw.amount === "number") {
		amount = raw.amount;
	} else if (typeof raw.amount === "string" && raw.amount.trim() !== "") {
		amount = Number(raw.amount);
	} else {
		return { error: "请填写赞助金额" };
	}
	if (!Number.isFinite(amount)) return { error: "赞助金额格式不正确" };
	if (amount < 0.01) return { error: "赞助金额不能小于 0.01" };
	if (amount > 99999) return { error: "赞助金额不能超过 99999" };

	if (raw.anonymous !== undefined && typeof raw.anonymous !== "boolean") {
		return { error: "匿名参数格式不正确" };
	}
	const anonymous = raw.anonymous === true;

	const remark =
		typeof raw.remark === "string" ? raw.remark.trim() : "";
	if (remark.length > 200) return { error: "备注不能超过 200 个字符" };

	return { submit: { displayName, amount: round2(amount), anonymous, remark } };
}

/** 公开：已通过名单（金额降序，金额相同按通过时间倒序） */
sponsorsRouter.get("/", (_req, res) => {
	const rows = db
		.prepare(
			`SELECT * FROM sponsors
       WHERE status = 'approved'
       ORDER BY amount DESC, approved_at DESC, id DESC`,
		)
		.all() as SponsorRow[];
	res.json({ sponsors: rows.map(toPublic) });
});

/** 公开：统计（仅累计数字金额，匿名计入；待审/拒绝不计） */
sponsorsRouter.get("/stats", (_req, res) => {
	const row = db
		.prepare(
			`SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount
       FROM sponsors WHERE status = 'approved'`,
		)
		.get() as { count: number; amount: number };
	res.json({ count: row.count, amount: round2(row.amount) });
});

/** 管理员：待审队列（含提交者账号邮箱与来源 IP） */
sponsorsRouter.get("/pending", requireAuth, requireAdmin, (_req, res) => {
	const rows = db
		.prepare(
			`SELECT s.*, u.email AS email
       FROM sponsors s LEFT JOIN users u ON u.id = s.user_id
       WHERE s.status = 'pending'
       ORDER BY s.created_at DESC`,
		)
		.all() as (SponsorRow & { email: string | null })[];
	res.json({
		items: rows.map((row) => ({
			id: row.id,
			displayName: row.display_name,
			amount: round2(row.amount),
			amountText: row.amount_text,
			anonymous: Boolean(row.anonymous),
			remark: row.remark,
			sourceIp: row.source_ip,
			email: row.email,
			createdAt: row.created_at,
		})),
	});
});

/** 登录用户：提交赞助登记（pending，等待管理员审核） */
sponsorsRouter.post("/", requireAuth, sponsorSubmitLimiter, (req, res) => {
	const { submit, error } = parseSubmit(req.body);
	if (error || !submit) {
		res.status(400).json({ error: error ?? "参数不完整" });
		return;
	}
	const result = db
		.prepare(
			`INSERT INTO sponsors
       (user_id, display_name, amount, amount_text, anonymous, remark, source_ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
		)
		.run(
			req.user!.id,
			submit.displayName,
			submit.amount,
			String(submit.amount),
			submit.anonymous ? 1 : 0,
			submit.remark,
			req.ip ?? "",
		);
	const row = db
		.prepare("SELECT * FROM sponsors WHERE id = ?")
		.get(Number(result.lastInsertRowid)) as SponsorRow;
	res.status(201).json({
		sponsor: {
			id: row.id,
			displayName: row.display_name,
			amount: round2(row.amount),
			amountText: row.amount_text,
			anonymous: Boolean(row.anonymous),
			status: row.status,
			createdAt: row.created_at,
		},
	});
});

/** 管理员：通过一条待审记录（同账号已通过 → 合并累计） */
sponsorsRouter.post("/:id/approve", requireAuth, requireAdmin, (req, res) => {
	const row = db
		.prepare("SELECT * FROM sponsors WHERE id = ? AND status = 'pending'")
		.get(Number(req.params.id)) as SponsorRow | undefined;
	if (!row) {
		res.status(404).json({ error: "待审记录不存在" });
		return;
	}

	const existing = row.user_id
		? (db
				.prepare(
					"SELECT * FROM sponsors WHERE user_id = ? AND status = 'approved'",
				)
				.get(row.user_id) as SponsorRow | undefined)
		: undefined;

	if (existing) {
		const mergedAmount = round2(existing.amount + row.amount);
		db.prepare(
			`UPDATE sponsors
       SET display_name = ?, amount = ?, amount_text = ?, anonymous = ?,
           approved_at = datetime('now')
       WHERE id = ?`,
		).run(
			row.display_name,
			mergedAmount,
			String(mergedAmount),
			row.anonymous,
			existing.id,
		);
		db.prepare("DELETE FROM sponsors WHERE id = ?").run(row.id);
		const merged = db
			.prepare("SELECT * FROM sponsors WHERE id = ?")
			.get(existing.id) as SponsorRow;
		res.json({ sponsor: toPublic(merged) });
		return;
	}

	db.prepare(
		"UPDATE sponsors SET status = 'approved', approved_at = datetime('now') WHERE id = ?",
	).run(row.id);
	const approved = db
		.prepare("SELECT * FROM sponsors WHERE id = ?")
		.get(row.id) as SponsorRow;
	res.json({ sponsor: toPublic(approved) });
});

/** 管理员：拒绝一条待审记录 */
sponsorsRouter.post("/:id/reject", requireAuth, requireAdmin, (req, res) => {
	const result = db
		.prepare(
			"UPDATE sponsors SET status = 'rejected' WHERE id = ? AND status = 'pending'",
		)
		.run(Number(req.params.id));
	if (result.changes === 0) {
		res.status(404).json({ error: "待审记录不存在" });
		return;
	}
	res.json({ ok: true });
});

/** 管理员：修改已通过记录（昵称/金额/匿名状态） */
sponsorsRouter.put("/:id", requireAuth, requireAdmin, (req, res) => {
	const row = db
		.prepare("SELECT * FROM sponsors WHERE id = ? AND status = 'approved'")
		.get(Number(req.params.id)) as SponsorRow | undefined;
	if (!row) {
		res.status(404).json({ error: "已通过记录不存在" });
		return;
	}
	const raw = (req.body ?? {}) as Record<string, unknown>;

	let displayName = row.display_name;
	if (raw.displayName !== undefined) {
		displayName =
			typeof raw.displayName === "string"
				? raw.displayName.replace(/[\u0000-\u001f\u007f]/g, "").trim()
				: "";
		if (!displayName || displayName.length > 24) {
			res.status(400).json({ error: "昵称需为 1-24 个字符" });
			return;
		}
	}

	let amount = row.amount;
	if (raw.amount !== undefined) {
		if (typeof raw.amount === "number") {
			amount = raw.amount;
		} else if (typeof raw.amount === "string" && raw.amount.trim() !== "") {
			amount = Number(raw.amount);
		} else {
			res.status(400).json({ error: "请填写赞助金额" });
			return;
		}
		if (!Number.isFinite(amount) || amount < 0.01 || amount > 99999) {
			res.status(400).json({ error: "赞助金额需在 0.01-99999 之间" });
			return;
		}
		amount = round2(amount);
	}

	let anonymous = Boolean(row.anonymous);
	if (raw.anonymous !== undefined) {
		if (typeof raw.anonymous !== "boolean") {
			res.status(400).json({ error: "匿名参数格式不正确" });
			return;
		}
		anonymous = raw.anonymous;
	}

	db.prepare(
		`UPDATE sponsors
     SET display_name = ?, amount = ?, amount_text = ?, anonymous = ?
     WHERE id = ?`,
	).run(displayName, amount, String(amount), anonymous ? 1 : 0, row.id);
	const updated = db
		.prepare("SELECT * FROM sponsors WHERE id = ?")
		.get(row.id) as SponsorRow;
	res.json({ sponsor: toPublic(updated) });
});

/** 管理员：删除记录 */
sponsorsRouter.delete("/:id", requireAuth, requireAdmin, (req, res) => {
	const result = db
		.prepare("DELETE FROM sponsors WHERE id = ?")
		.run(Number(req.params.id));
	if (result.changes === 0) {
		res.status(404).json({ error: "记录不存在" });
		return;
	}
	res.json({ ok: true });
});
