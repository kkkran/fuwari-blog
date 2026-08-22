import { Router } from "express";
import multer from "multer";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { isUtf8 } from "node:buffer";
import { resolve } from "node:path";
import { config } from "./config.js";
import { db } from "./db.js";
import { createRateLimiter } from "./rate-limit.js";
import { requireAdmin, requireAuth } from "./middleware.js";

// txt 分享：落盘到独立受控目录（不经 /uploads 静态目录，未审核文件不可被直读）
export const SHARE_DIR = resolve(config.shareDir);
mkdirSync(SHARE_DIR, { recursive: true });

// 每人活跃（未过期且未删除）文件上限：超过后新上传进入 pending，等待管理员审核
const MAX_ACTIVE_FILES = 10;
const ALLOWED_EXPIRY_DAYS = new Set([0, 1, 7, 30]); // 0 = 永久

// 内存暂存后写入受控目录；仅收 txt，大小上限 1MB
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 1 * 1024 * 1024 },
	fileFilter: (_req, file, callback) => {
		if (!file.originalname.toLowerCase().endsWith(".txt")) {
			callback(new Error("仅支持上传 .txt 文本文件"));
			return;
		}
		callback(null, true);
	},
});

interface ShareRow {
	id: string;
	user_id: number;
	filename: string;
	status: string;
	size: number;
	expires_at: string | null;
	created_at: string;
}

/** 记录是否仍可访问（approved 且未过期） */
export function isShareActive(row: Pick<ShareRow, "status" | "expires_at">): boolean {
	if (row.status !== "approved") return false;
	if (!row.expires_at) return true;
	return new Date(row.expires_at).getTime() > Date.now();
}

/** 清扫过期文件：删除记录与磁盘文件，返回删除数量 */
export function sweepExpired(): number {
	const rows = db
		.prepare(
			"SELECT id FROM share_files WHERE expires_at IS NOT NULL AND expires_at <= ?",
		)
		.all(new Date().toISOString()) as { id: string }[];
	for (const row of rows) {
		try {
			unlinkSync(resolve(SHARE_DIR, `${row.id}.txt`));
		} catch {
			// 磁盘文件缺失不阻塞
		}
		db.prepare("DELETE FROM share_files WHERE id = ?").run(row.id);
	}
	return rows.length;
}

// 每日定时清扫（unref：不阻塞进程退出，测试环境下自动让位）
const sweepTimer = setInterval(sweepExpired, 24 * 60 * 60 * 1000);
sweepTimer.unref();

// 上传限流：放在 requireAuth 之后（getKey 用用户 id，避免未登录请求拖累 IP 计数）
const shareUploadLimiter = createRateLimiter({
	windowMs: 5 * 60 * 1000,
	max: 50,
	keyPrefix: "share",
	getKey: (req) => String((req as { user?: { id: number } }).user?.id ?? req.ip),
});

export const shareRouter = Router();

// 我的文件列表（含 pending/过期，前端按状态分组展示）
shareRouter.get("/my", requireAuth, (req, res) => {
	const rows = db
		.prepare(
			"SELECT * FROM share_files WHERE user_id = ? ORDER BY created_at DESC",
		)
		.all(req.user!.id) as ShareRow[];
	res.json({
		files: rows.map((r) => ({
			id: r.id,
			filename: r.filename,
			status: r.status,
			size: r.size,
			rawUrl: `/share/${r.id}.txt`,
			expiresAt: r.expires_at,
			createdAt: r.created_at,
		})),
	});
});

shareRouter.post("/", requireAuth, shareUploadLimiter, upload.single("file"), (req, res) => {
	if (!req.file) {
		res.status(400).json({ error: "未收到 txt 文件" });
		return;
	}
	// txt 必须是真的文本：夹带二进制（非法 UTF-8）一律拒绝
	if (!isUtf8(req.file.buffer)) {
		res.status(400).json({ error: "文件内容不是有效的文本" });
		return;
	}
	// 过期档位：expiresInDays ∈ {0,1,7,30}，缺省 7 天
	const rawDays = req.body?.expiresInDays;
	let expiresInDays = 7;
	if (rawDays !== undefined && rawDays !== "") {
		expiresInDays = Number(rawDays);
		if (!ALLOWED_EXPIRY_DAYS.has(expiresInDays)) {
			res.status(400).json({ error: "过期间隔不合法" });
			return;
		}
	}
	const expiresAt =
		expiresInDays === 0 ? null : new Date(Date.now() + expiresInDays * 86400_000).toISOString();

	const id = randomUUID();
	const filename = `${id}.txt`;
	// 同步落盘：文件存在性先于 DB 记录，读取接口只认 DB 记录
	writeFileSync(resolve(SHARE_DIR, filename), req.file.buffer);

	// 活跃文件数（approved 且未过期）达到上限后进入 pending
	const activeCount = (
		db.prepare(
			`SELECT COUNT(*) AS c FROM share_files
       WHERE user_id = ? AND status = 'approved'
         AND (expires_at IS NULL OR expires_at > ?)`,
		).get(req.user!.id, new Date().toISOString()) as { c: number }
	).c;
	const status = activeCount < MAX_ACTIVE_FILES ? "approved" : "pending";

	db.prepare(
		`INSERT INTO share_files (id, user_id, filename, status, size, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
	).run(id, req.user!.id, req.file.originalname, status, req.file.buffer.length, expiresAt);

	res.status(201).json({ id, rawUrl: `/share/${filename}`, status });
});

// 审核内容预览（管理员）：pending 文件公开不可读，审核时经此读取内容
shareRouter.get("/admin/:id/content", requireAuth, requireAdmin, (req, res) => {
	const id = req.params.id ?? "";
	if (!/^[0-9a-f-]{36}$/.test(id)) {
		res.status(404).json({ error: "Not Found" });
		return;
	}
	const row = db.prepare("SELECT * FROM share_files WHERE id = ?").get(id) as
		| ShareRow
		| undefined;
	if (!row) {
		res.status(404).json({ error: "Not Found" });
		return;
	}
	const fullPath = resolve(SHARE_DIR, `${id}.txt`);
	if (!existsSync(fullPath)) {
		res.status(404).json({ error: "Not Found" });
		return;
	}
	res.setHeader("Content-Type", "text/plain; charset=utf-8");
	res.send(readFileSync(fullPath));
});

// 待审列表（管理员）：超限上传的文件在此等待通过/拒绝
shareRouter.get("/admin/pending", requireAuth, requireAdmin, (_req, res) => {
	const rows = db
		.prepare(
			`SELECT s.*, u.email
       FROM share_files s JOIN users u ON u.id = s.user_id
       WHERE s.status = 'pending' ORDER BY s.created_at DESC`,
		)
		.all() as (ShareRow & { email: string })[];
	res.json({
		files: rows.map((r) => ({
			id: r.id,
			email: r.email,
			filename: r.filename,
			status: r.status,
			size: r.size,
			createdAt: r.created_at,
		})),
	});
});

// 通过审核：立即可公开读取
shareRouter.post("/admin/:id/approve", requireAuth, requireAdmin, (req, res) => {
	const id = req.params.id ?? "";
	if (!/^[0-9a-f-]{36}$/.test(id)) {
		res.status(404).json({ error: "Not Found" });
		return;
	}
	const result = db
		.prepare("UPDATE share_files SET status = 'approved' WHERE id = ? AND status = 'pending'")
		.run(id);
	if (result.changes === 0) {
		res.status(404).json({ error: "Not Found" });
		return;
	}
	res.json({ ok: true });
});

// 拒绝：删除文件与记录
shareRouter.post("/admin/:id/reject", requireAuth, requireAdmin, (req, res) => {
	const id = req.params.id ?? "";
	if (!/^[0-9a-f-]{36}$/.test(id)) {
		res.status(404).json({ error: "Not Found" });
		return;
	}
	const result = db
		.prepare("DELETE FROM share_files WHERE id = ? AND status = 'pending'")
		.run(id);
	if (result.changes === 0) {
		res.status(404).json({ error: "Not Found" });
		return;
	}
	try {
		unlinkSync(resolve(SHARE_DIR, `${id}.txt`));
	} catch {
		// 文件缺失不阻塞
	}
	res.json({ ok: true });
});

// 删除：本人或管理员；删除后文件与记录一并清除
shareRouter.delete("/:id", requireAuth, (req, res) => {
	const id = req.params.id ?? "";
	if (!/^[0-9a-f-]{36}$/.test(id)) {
		res.status(404).json({ error: "Not Found" });
		return;
	}
	const row = db.prepare("SELECT * FROM share_files WHERE id = ?").get(id) as
		| ShareRow
		| undefined;
	if (!row) {
		res.status(404).json({ error: "Not Found" });
		return;
	}
	const isOwner = row.user_id === req.user!.id;
	const isAdmin = req.user!.role === "admin";
	if (!isOwner && !isAdmin) {
		res.status(403).json({ error: "无权删除该文件" });
		return;
	}
	try {
		unlinkSync(resolve(SHARE_DIR, `${id}.txt`));
	} catch {
		// 磁盘文件缺失不阻塞删除记录
	}
	db.prepare("DELETE FROM share_files WHERE id = ?").run(id);
	res.json({ ok: true });
});

// 公开读取（Clash 客户端直接 GET 消费）：仅 approved 且未过期；pending/过期/不存在一律 404，
// 不泄露文件状态。安全响应：text/plain + nosniff（全局中间件）+ inline。
shareRouter.get("/:file", (req, res) => {
	const file = req.params.file ?? "";
	// 文件名必须是 <uuid>.txt，杜绝路径穿越
	if (!/^[0-9a-f-]{36}\.txt$/.test(file)) {
		res.status(404).json({ error: "Not Found" });
		return;
	}
	const id = file.slice(0, -4);
	const row = db.prepare("SELECT * FROM share_files WHERE id = ?").get(id) as
		| ShareRow
		| undefined;
	if (!row || !isShareActive(row)) {
		res.status(404).json({ error: "Not Found" });
		return;
	}
	const fullPath = resolve(SHARE_DIR, file);
	if (!existsSync(fullPath)) {
		res.status(404).json({ error: "Not Found" });
		return;
	}
	res.setHeader("Content-Type", "text/plain; charset=utf-8");
	res.setHeader("Content-Disposition", "inline");
	res.send(readFileSync(fullPath));
});