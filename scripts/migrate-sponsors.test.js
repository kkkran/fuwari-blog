/**
 * 赞助历史数据迁移解析（Seam 2 规格）
 *
 * 覆盖金额解析口径（Q9-A：仅人民币数字计入累计）：
 * - 10￥ / 50 ￥ / 19.80￥ / 10 CNY / 11.45 CNY / ￥12 → 数字金额
 * - 5 B币 / 5 USDC / 5B币+99电池 / 两个月充电 → 金额 0，原文保留展示
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAmount, parseSponsorFile, loadSponsorFiles } from "./migrate-sponsors.js";

describe("parseAmount 金额解析", () => {
	it("人民币后缀 ￥ 解析为数字金额", () => {
		expect(parseAmount("10￥")).toEqual({ amount: 10, amountText: "10￥" });
		expect(parseAmount("50 ￥")).toEqual({ amount: 50, amountText: "50 ￥" });
		expect(parseAmount("19.80￥")).toEqual({ amount: 19.8, amountText: "19.80￥" });
	});

	it("人民币前缀 ¥ / 单位 CNY 解析为数字金额", () => {
		expect(parseAmount("¥12")).toEqual({ amount: 12, amountText: "¥12" });
		expect(parseAmount("10 CNY")).toEqual({ amount: 10, amountText: "10 CNY" });
		expect(parseAmount("11.45 CNY")).toEqual({ amount: 11.45, amountText: "11.45 CNY" });
	});

	it("非人民币单位（B币/USDC/电池/文字）金额记为 0，原文保留", () => {
		expect(parseAmount("5 B币")).toEqual({ amount: 0, amountText: "5 B币" });
		expect(parseAmount("5 USDC")).toEqual({ amount: 0, amountText: "5 USDC" });
		expect(parseAmount("5B币+99电池")).toEqual({ amount: 0, amountText: "5B币+99电池" });
		expect(parseAmount("两个月充电")).toEqual({
			amount: 0,
			amountText: "两个月充电",
		});
	});
});

describe("parseSponsorFile 单条记录解析", () => {
	it("映射 name/avatar/date，并补零日期", () => {
		const row = parseSponsorFile(
			JSON.stringify({
				name: "明镜台",
				avatar: "/sponsors/mjt.jpg",
				date: "2025-8-2",
				amount: "100 ￥",
			}),
		);
		expect(row).toEqual({
			displayName: "明镜台",
			avatarUrl: "/sponsors/mjt.jpg",
			amount: 100,
			amountText: "100 ￥",
			approvedAt: "2025-08-02",
		});
	});

	it("无头像时 avatarUrl 为空字符串", () => {
		const row = parseSponsorFile(
			JSON.stringify({ name: "匿名用户", avatar: "", date: "2025-07-15", amount: "19.80￥" }),
		);
		expect(row.avatarUrl).toBe("");
	});

	it("非法 JSON 抛错（由调用方跳过）", () => {
		expect(() => parseSponsorFile("{broken")).toThrow();
	});
});

describe("loadSponsorFiles 目录读取", () => {
	it("读取目录下全部 JSON 并排序输出", () => {
		const dir = mkdtempSync(join(tmpdir(), "sponsor-migrate-"));
		try {
			writeFileSync(
				join(dir, "a.json"),
				JSON.stringify({ name: "A", avatar: "", date: "2025-01-01", amount: "10￥" }),
			);
			writeFileSync(
				join(dir, "b.json"),
				JSON.stringify({ name: "B", avatar: "", date: "2025-01-02", amount: "5 B币" }),
			);
			writeFileSync(join(dir, "broken.json"), "{oops");
			const rows = loadSponsorFiles(dir);
			expect(rows).toHaveLength(2);
			expect(rows.map((r) => r.displayName)).toEqual(["A", "B"]);
			expect(rows[0].amount).toBe(10);
			expect(rows[1].amount).toBe(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
