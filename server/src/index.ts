import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import multer from "multer";
import { pathToFileURL } from "node:url";
import { config } from "./config.js";
import { authRouter } from "./auth.js";
import { blogRouter } from "./blog.js";
import { notificationsRouter } from "./notifications.js";
import { publicRouter } from "./public.js";
import { uploadRouter } from "./upload.js";
import { resolve } from "node:path";

/** 构建应用（不监听端口），供入口与集成测试复用 */
export function createApp() {
	const app = express();

	app.use(
		cors({
			origin(origin, callback) {
				// 无 Origin（同源/非浏览器）直接放行
				if (!origin || config.corsOrigins.includes(origin)) {
					callback(null, true);
					return;
				}
				callback(new Error("Not allowed by CORS"));
			},
			credentials: true,
		}),
	);
	app.use(cookieParser());
	app.use(express.json({ limit: "10mb" }));

	// 上传文件静态服务
	app.use("/uploads", express.static(resolve("./data/uploads")));

	app.get("/api/health", (_req, res) => {
		res.json({ ok: true, name: "fuwari-blog-server" });
	});

	app.use("/api/auth", authRouter);
	app.use("/api/blog", blogRouter);
	app.use("/api/notifications", notificationsRouter);
	app.use("/api/public", publicRouter);
	app.use("/api/upload", uploadRouter);

	// 404
	app.use((_req, res) => {
		res.status(404).json({ error: "Not Found" });
	});

	// 统一错误处理
	app.use(
		(
			err: Error,
			_req: express.Request,
			res: express.Response,
			_next: express.NextFunction,
		) => {
			if (err instanceof multer.MulterError) {
				res.status(400).json({
					error:
						err.code === "LIMIT_FILE_SIZE"
							? "图片大小不能超过 5MB"
							: `上传失败：${err.code}`,
				});
				return;
			}
			if (err.message === "Not allowed by CORS") {
				res.status(403).json({ error: "请求来源不被允许（CORS）" });
				return;
			}
			if (err.message === "仅支持上传图片文件") {
				res.status(400).json({ error: err.message });
				return;
			}
			console.error("[server error]", err);
			res.status(500).json({ error: "服务器内部错误" });
		},
	);

	return app;
}

// 直接运行时监听端口（集成测试通过 createApp 自建临时端口，不触发监听）
const isEntry =
	process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	const app = createApp();
	app.listen(config.port, () => {
		console.log(
			`[fuwari-blog-server] listening on http://127.0.0.1:${config.port}`,
		);
	});
}
