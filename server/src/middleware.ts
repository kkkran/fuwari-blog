import type { NextFunction, Request, Response } from "express";
import { getSessionUser } from "./users.js";
import { config } from "./config.js";
import type { User } from "./types.js";

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Express {
		interface Request {
			user?: User;
		}
	}
}

export function getSessionToken(req: Request): string | null {
	const cookieName = config.sessionCookieName;
	const raw = (req as Request & { cookies?: Record<string, string> }).cookies?.[
		cookieName
	];
	return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export function requireAuth(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	const token = getSessionToken(req);
	if (!token) {
		res.status(401).json({ error: "未登录" });
		return;
	}
	const user = getSessionUser(token);
	if (!user) {
		res.status(401).json({ error: "会话已失效，请重新登录" });
		return;
	}
	req.user = user;
	next();
}

export function requireAdmin(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	if (!req.user) {
		res.status(401).json({ error: "未登录" });
		return;
	}
	if (req.user.role !== "admin") {
		res.status(403).json({ error: "需要管理员权限" });
		return;
	}
	next();
}
