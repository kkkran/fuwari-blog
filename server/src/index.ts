import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { authRouter } from "./auth.js";
import { blogRouter } from "./blog.js";
import { notificationsRouter } from "./notifications.js";
import { publicRouter } from "./public.js";

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

app.get("/api/health", (_req, res) => {
	res.json({ ok: true, name: "fuwari-blog-server" });
});

app.use("/api/auth", authRouter);
app.use("/api/blog", blogRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/public", publicRouter);

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
		console.error("[server error]", err);
		res.status(500).json({ error: "服务器内部错误" });
	},
);

app.listen(config.port, () => {
	console.log(`[fuwari-blog-server] listening on http://127.0.0.1:${config.port}`);
});
