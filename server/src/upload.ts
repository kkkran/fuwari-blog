import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { extname, resolve } from "node:path";
import { requireAuth } from "./middleware.js";

const UPLOAD_DIR = resolve("./data/uploads");
mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXTENSIONS = new Set([
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
	".svg",
	".avif",
]);

const storage = multer.diskStorage({
	destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),
	filename: (_req, file, callback) => {
		const ext = extname(file.originalname).toLowerCase();
		callback(null, `${randomUUID()}${ALLOWED_EXTENSIONS.has(ext) ? ext : ""}`);
	},
});

const upload = multer({
	storage,
	limits: { fileSize: 5 * 1024 * 1024 },
	fileFilter: (_req, file, callback) => {
		if (!file.mimetype.startsWith("image/")) {
			callback(new Error("仅支持上传图片文件"));
			return;
		}
		callback(null, true);
	},
});

export const uploadRouter = Router();

uploadRouter.post("/", requireAuth, upload.single("file"), (req, res) => {
	if (!req.file) {
		res.status(400).json({ error: "未收到图片文件" });
		return;
	}
	const url = `/uploads/${req.file.filename}`;
	res.status(201).json({ url });
});
