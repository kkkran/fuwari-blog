import { describe, expect, it } from "vitest";
import type { BangumiRssItem } from "./bangumi-rss";
import { buildBangumiCards, groupCardsByCategory } from "./bangumi-cards";

const rssItem: BangumiRssItem = {
	category: "在看",
	subjectId: "607915",
	title: "凡人修仙传 第五季",
	coverUrl: "https://lain.bgm.tv/pic/cover/s/ac/c9/607915_RBL8u.jpg",
	pubDate: "Wed, 12 Aug 2026 03:33:21 +0000",
};

const subjectDetail = {
	id: 607915,
	name: "凡人修仙传 第五季",
	name_cn: "凡人修仙传 第五季",
	images: {
		large: "https://lain.bgm.tv/pic/cover/l/ac/c9/607915_RBL8u.jpg",
	},
	rating: { score: 7.5 },
	eps: 52,
	total_episodes: 52,
	summary: "《凡人修仙传》新年番即将于2026年第二季度与大家相见。",
};

describe("buildBangumiCards", () => {
	it("有详情时合并封面/评分/进度/简介", () => {
		const cards = buildBangumiCards([rssItem], new Map([[607915, subjectDetail]]));

		expect(cards).toHaveLength(1);
		expect(cards[0]).toEqual({
			category: "在看",
			subjectId: "607915",
			title: "凡人修仙传 第五季",
			coverUrl: "https://lain.bgm.tv/pic/cover/l/ac/c9/607915_RBL8u.jpg",
			pubDate: "Wed, 12 Aug 2026 03:33:21 +0000",
			score: 7.5,
			eps: 52,
			totalEps: 52,
			summary: "《凡人修仙传》新年番即将于2026年第二季度与大家相见。",
			detailUrl: "https://bgm.tv/subject/607915",
		});
	});

	it("详情缺失时降级为仅 RSS 字段", () => {
		const cards = buildBangumiCards([rssItem], new Map());

		expect(cards).toHaveLength(1);
		expect(cards[0]).toEqual({
			category: "在看",
			subjectId: "607915",
			title: "凡人修仙传 第五季",
			coverUrl: "https://lain.bgm.tv/pic/cover/s/ac/c9/607915_RBL8u.jpg",
			pubDate: "Wed, 12 Aug 2026 03:33:21 +0000",
			score: undefined,
			eps: undefined,
			totalEps: undefined,
			summary: "",
			detailUrl: "https://bgm.tv/subject/607915",
		});
	});

	it("条目与详情数量不同时不丢条目", () => {
		const other: BangumiRssItem = {
			...rssItem,
			subjectId: "408991",
			title: "葬送的芙莉莲",
			coverUrl: "https://lain.bgm.tv/pic/cover/s/b3/d1/408991_rRLgE.jpg",
		};
		const cards = buildBangumiCards([rssItem, other], new Map([[607915, subjectDetail]]));
		expect(cards).toHaveLength(2);
		expect(cards[1].score).toBeUndefined();
	});
});

describe("groupCardsByCategory", () => {
	it("按分类分组并保序", () => {
		const cards = buildBangumiCards(
			[
				{ ...rssItem, subjectId: "1", title: "A", category: "想看" },
				{ ...rssItem, subjectId: "2", title: "B", category: "在看" },
				{ ...rssItem, subjectId: "3", title: "C", category: "看过" },
				{ ...rssItem, subjectId: "4", title: "D", category: "在看" },
			],
			new Map(),
		);
		const groups = groupCardsByCategory(cards);

		expect(Object.keys(groups)).toEqual(["想看", "在看", "看过"]);
		expect(groups["在看"].map((c) => c.subjectId)).toEqual(["2", "4"]);
	});

	it("空输入返回空分组", () => {
		expect(groupCardsByCategory([])).toEqual({});
	});
});
