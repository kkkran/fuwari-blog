import { Router } from "express";
import { db } from "./db.js";
import { requireAuth } from "./middleware.js";

export const notificationsRouter = Router();

export function createNotification(
	userId: number,
	type: string,
	message: string,
): void {
	db.prepare(
		"INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)",
	).run(userId, type, message);
}

/** 未读数量（导航栏徽标轮询） */
notificationsRouter.get("/unread-count", requireAuth, (req, res) => {
	const row = db
		.prepare(
			"SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read = 0",
		)
		.get(req.user!.id) as { count: number };
	res.json({ count: row.count });
});

/** 通知列表 */
notificationsRouter.get("/", requireAuth, (req, res) => {
	const rows = db
		.prepare(
			`SELECT id, type, message, read, created_at
       FROM notifications WHERE user_id = ?
       ORDER BY created_at DESC LIMIT 50`,
		)
		.all(req.user!.id) as {
		id: number;
		type: string;
		message: string;
		read: number;
		created_at: string;
	}[];
	res.json({
		items: rows.map((row) => ({
			id: row.id,
			type: row.type,
			message: row.message,
			read: row.read === 1,
			createdAt: row.created_at,
		})),
	});
});

/** 标记已读（body: { ids?: number[] }，缺省全部标记） */
notificationsRouter.post("/read", requireAuth, (req, res) => {
	const ids = (req.body ?? {}).ids;
	if (Array.isArray(ids) && ids.length > 0) {
		const placeholders = ids.map(() => "?").join(",");
		db.prepare(
			`UPDATE notifications SET read = 1
       WHERE user_id = ? AND id IN (${placeholders})`,
		).run(req.user!.id, ...ids);
	} else {
		db.prepare(
			"UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0",
		).run(req.user!.id);
	}
	res.json({ ok: true });
});
