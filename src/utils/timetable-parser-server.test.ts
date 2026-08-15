/**
 * parseTimetableFile 容错测试（vitest）
 *
 * 回归保护：课表文件缺失（部署 cwd 不一致、文件被移除）时，
 * 必须降级返回空课表，而不是抛 ENOENT 拖垮整站（曾导致 /bangumi/ 等页面 500）。
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTimetableFile } from "./timetable-parser-server";

// 最小合法 5 段课表文本（config / nodeTimes / meta / courseDefinitions / arrangements）
const VALID_TIMETABLE = [
	`{"courseLen":0,"id":0,"name":"test"}`,
	`[]`,
	`{"id":1,"tableName":"测试课表","maxWeek":16,"nodes":4,"startDate":"2026-02-23","timeTable":0}`,
	`[]`,
	`[]`,
].join("\n");

describe("parseTimetableFile", () => {
	it("文件不存在时返回空课表而非抛错", () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "timetable-test-"));
		try {
			const missing = join(tmpDir, "不存在.json");
			expect(() => parseTimetableFile(missing)).not.toThrow();
			const result = parseTimetableFile(missing);
			expect(result.meta.maxWeek).toBe(0);
			expect(result.meta.startDate).toBe("");
			expect(result.courseDefinitions).toEqual([]);
			expect(result.arrangements).toEqual([]);
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("存在的合法文件正常解析", () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "timetable-test-"));
		try {
			const file = join(tmpDir, "valid.json");
			writeFileSync(file, VALID_TIMETABLE, "utf-8");
			const result = parseTimetableFile(file);
			expect(result.meta.tableName).toBe("测试课表");
			expect(result.meta.maxWeek).toBe(16);
			expect(result.meta.startDate).toBe("2026-02-23");
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});
