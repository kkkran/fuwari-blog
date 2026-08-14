/**
 * 内存速率限制中间件（单实例进程内计数，固定窗口）。
 *
 * 用于登录/注册/投稿/上传等敏感接口，防止公网暴露后被暴力刷接口。
 * key 默认取客户端 IP，可通过 getKey 自定义（如登录后按用户）。
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";

export interface RateLimitOptions {
	/** 窗口时长（毫秒） */
	windowMs: number;
	/** 窗口内最大请求数 */
	max: number;
	/** key 前缀，隔离不同限流器 */
	keyPrefix: string;
	/** key 提取（默认按 IP） */
	getKey?: (req: Request) => string;
	/** 可注入时钟（测试用） */
	now?: () => number;
	/** 429 响应体 message */
	message?: string;
}

interface WindowEntry {
	count: number;
	resetAt: number;
}

export function createRateLimiter(options: RateLimitOptions): RequestHandler {
	const {
		windowMs,
		max,
		keyPrefix,
		getKey = (req) => req.ip ?? "unknown",
		now = Date.now,
		message = "请求过于频繁，请稍后再试",
	} = options;

	const buckets = new Map<string, WindowEntry>();

	return (req: Request, res: Response, next: NextFunction) => {
		const current = now();
		const key = `${keyPrefix}:${getKey(req)}`;
		const entry = buckets.get(key);
		if (!entry || current >= entry.resetAt) {
			buckets.set(key, { count: 1, resetAt: current + windowMs });
			next();
			return;
		}
		entry.count += 1;
		if (entry.count > max) {
			res.status(429).json({ error: message });
			return;
		}
		next();
	};
}
