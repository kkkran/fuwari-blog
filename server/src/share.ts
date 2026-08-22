import { Router } from "express";
import multer from "multer";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { isUtf8 } from "node:buffer";
import { resolve } from "node:path";
import { config } from "./config.js";
import { db } from "./db.js";
import { requireAuth } from "./middleware.js";

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

export const shareRouter = Router();

shareRouter.post("/", requireAuth, upload.single("file"), (req, res) => {
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