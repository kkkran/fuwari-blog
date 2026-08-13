import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFile } from "node:fs";
import { extname, resolve } from "node:path";
import { config } from "./config.js";
import { uploadToImageHosting } from "./image-hosting.js";
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

// 内存暂存：先尝试转发图床，失败再落盘本地，保证磁盘只有一份
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 5 * 1024 * 1024 },
	fileFilter: (_req, file, callback) => {
		if (!file.mimetype.startsWith("image/")) {
			callback(new Error("仅支持上传图片文件"));
			return;
		}
		callback(null, true);
	},
});

function saveToLocal(file: Express.Multer.File): string {
	const ext = extname(file.originalname).toLowerCase();
	const filename = `${randomUUID()}${ALLOWED_EXTENSIONS.has(ext) ? ext : ""}`;
	writeFile(resolve(UPLOAD_DIR, filename), file.buffer, (error) => {
		if (error) {
			console.error("保存上传文件失败：", error);
		}
	});
	return `/uploads/${filename}`;
}

export const uploadRouter = Router();

uploadRouter.post("/", requireAuth, upload.single("file"), async (req, res) => {
	if (!req.file) {
		res.status(400).json({ error: "未收到图片文件" });
		return;
	}
	const hosted = await uploadToImageHosting({
		originalname: req.file.originalname,
		mimetype: req.file.mimetype,
		buffer: req.file.buffer,
	});
	const url = hosted?.url ?? saveToLocal(req.file);
	res.status(201).json({ url });
});
