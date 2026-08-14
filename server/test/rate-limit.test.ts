/**
 * 速率限制中间件单元测试（node:test + tsx）
 *
 * 覆盖：窗口内放行与计数、超限 429、窗口过期重置、按 key 隔离、
 * 可注入时钟。通过模拟 req/res/next 直接调用中间件。
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { createRateLimiter } from "../src/rate-limit.js";

function createFakeContext() {
	let now = 0;
	const calls: string[] = [];
	const req = { ip: "1.2.3.4" } as Request;
	const res = {
		status(code: number) {
			calls.push(`status:${code}`);
			return this;
		},
		json(body: unknown) {
			calls.push(`json:${JSON.stringify(body)}`);
			return this;
		},
	} as unknown as Response;
	const next: NextFunction = (() => {
		calls.push("next");
	}) as NextFunction;
	return {
		now: () => now,
		advance: (ms: number) => {
			now += ms;
		},
		req,
		res,
		next,
		getCalls: () => calls,
	};
}

describe("createRateLimiter", () => {
	it("窗口内未超限时全部放行并递增计数", () => {
		const ctx = createFakeContext();
		const limiter = createRateLimiter({
			windowMs: 60_000,
			max: 3,
			keyPrefix: "test",
			now: ctx.now,
		});
		limiter(ctx.req, ctx.res, ctx.next);
		limiter(ctx.req, ctx.res, ctx.next);
		limiter(ctx.req, ctx.res, ctx.next);
		assert.deepEqual(ctx.getCalls(), ["next", "next", "next"]);
	});

	it("超过窗口上限返回 429 并停止放行", () => {
		const ctx = createFakeContext();
		const limiter = createRateLimiter({
			windowMs: 60_000,
			max: 2,
			keyPrefix: "test",
			now: ctx.now,
		});
		limiter(ctx.req, ctx.res, ctx.next);
		limiter(ctx.req, ctx.res, ctx.next);
		limiter(ctx.req, ctx.res, ctx.next);
		const calls = ctx.getCalls();
		assert.deepEqual(calls.slice(0, 2), ["next", "next"]);
		assert.match(calls[2], /status:429/);
		assert.match(calls[3], /请求过于频繁|error/);
	});

	it("窗口过期后计数重置，请求恢复放行", () => {
		const ctx = createFakeContext();
		const limiter = createRateLimiter({
			windowMs: 60_000,
			max: 1,
			keyPrefix: "test",
			now: ctx.now,
		});
		limiter(ctx.req, ctx.res, ctx.next);
		limiter(ctx.req, ctx.res, ctx.next); // 429
		ctx.advance(60_001);
		limiter(ctx.req, ctx.res, ctx.next);
		const calls = ctx.getCalls();
		assert.deepEqual(calls[0], "next");
		assert.match(calls[1], /status:429/);
		assert.match(calls[2], /json:/);
		assert.deepEqual(calls[3], "next", "窗口过期后应重置");
	});

	it("不同 key（IP）独立计数", () => {
		const ctxA = createFakeContext();
		const ctxB = createFakeContext();
		Object.defineProperty(ctxB.req, "ip", { value: "5.6.7.8", writable: true });
		const limiter = createRateLimiter({
			windowMs: 60_000,
			max: 1,
			keyPrefix: "test",
			now: ctxA.now,
		});
		limiter(ctxA.req, ctxA.res, ctxA.next);
		limiter(ctxA.req, ctxA.res, ctxA.next); // A 429
		limiter(ctxB.req, ctxB.res, ctxB.next); // B 放行
		const aCalls = ctxA.getCalls();
		assert.deepEqual(aCalls[0], "next");
		assert.match(aCalls[1], /status:429/);
		assert.deepEqual(ctxB.getCalls(), ["next"]);
	});

	it("不同前缀的限流器互不影响", () => {
		const ctx = createFakeContext();
		const limiterA = createRateLimiter({
			windowMs: 60_000,
			max: 1,
			keyPrefix: "a",
			now: ctx.now,
		});
		const limiterB = createRateLimiter({
			windowMs: 60_000,
			max: 1,
			keyPrefix: "b",
			now: ctx.now,
		});
		limiterA(ctx.req, ctx.res, ctx.next);
		limiterB(ctx.req, ctx.res, ctx.next);
		limiterB(ctx.req, ctx.res, ctx.next); // B 429
		limiterA(ctx.req, ctx.res, ctx.next); // A 也 429（各自独立窗口）
		const statuses = ctx.getCalls().filter((c) => c.startsWith("status:"));
		assert.deepEqual(statuses, ["status:429", "status:429"]);
	});

	it("支持自定义 key 提取（如登录后按用户）", () => {
		const ctx = createFakeContext();
		Object.defineProperty(ctx.req, "user", { value: { id: 42 } });
		const limiter = createRateLimiter({
			windowMs: 60_000,
			max: 1,
			keyPrefix: "user",
			getKey: (req) => `user:${(req as Request & { user?: { id: number } }).user?.id ?? req.ip}`,
			now: ctx.now,
		});
		limiter(ctx.req, ctx.res, ctx.next);
		limiter(ctx.req, ctx.res, ctx.next);
		assert.deepEqual(ctx.getCalls()[1], "status:429");
	});
});
