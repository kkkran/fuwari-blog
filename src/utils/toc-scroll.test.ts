import { describe, expect, it } from "vitest";
import { computeActiveIndex } from "./toc-scroll";

describe("computeActiveIndex", () => {
	it("所有标题都在视口下方时无高亮（-1）", () => {
		// 阈值 100：标题顶距视口顶 > 100 视为未到达
		expect(computeActiveIndex([200, 1500, 3000], 100)).toBe(-1);
		expect(computeActiveIndex([120, 500], 100)).toBe(-1);
	});

	it("第一个标题越过阈值线时高亮它", () => {
		expect(computeActiveIndex([-300, 1500], 100)).toBe(0);
		expect(computeActiveIndex([100, 1500], 100)).toBe(0); // 恰好等于阈值也算
	});

	it("多个标题越过时高亮最后一个（当前阅读位置）", () => {
		expect(computeActiveIndex([-800, -200, 300], 100)).toBe(1);
		expect(computeActiveIndex([-1000, -500, -50, 500], 100)).toBe(2);
	});

	it("全部标题都越过时高亮最后一个", () => {
		expect(computeActiveIndex([-900, -600, -300], 100)).toBe(2);
	});

	it("空列表返回 -1", () => {
		expect(computeActiveIndex([], 100)).toBe(-1);
	});

	it("单个标题越过阈值线时高亮它", () => {
		expect(computeActiveIndex([-50], 100)).toBe(0);
	});
});
