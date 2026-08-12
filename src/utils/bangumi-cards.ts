import type { BangumiRssItem } from "./bangumi-rss";

export interface BangumiSubjectDetail {
	id: number;
	name?: string;
	name_cn?: string;
	images?: {
		large?: string;
	};
	rating?: {
		score?: number;
	};
	eps?: number;
	total_episodes?: number;
	summary?: string;
}

export interface BangumiCard {
	category: string;
	subjectId: string;
	title: string;
	coverUrl: string;
	pubDate: string;
	score: number | undefined;
	eps: number | undefined;
	totalEps: number | undefined;
	summary: string;
	detailUrl: string;
}

export type BangumiCategoryGroups = Record<string, BangumiCard[]>;

export function buildBangumiCards(
	items: BangumiRssItem[],
	details: Map<number, BangumiSubjectDetail>,
): BangumiCard[] {
	return items.map((item) => {
		const detail = details.get(Number(item.subjectId));
		return {
			category: item.category,
			subjectId: item.subjectId,
			title: detail?.name_cn || detail?.name || item.title,
			coverUrl: detail?.images?.large || item.coverUrl,
			pubDate: item.pubDate,
			score: detail?.rating?.score,
			eps: detail?.eps,
			totalEps: detail?.total_episodes,
			summary: detail?.summary || "",
			detailUrl: `https://bgm.tv/subject/${item.subjectId}`,
		};
	});
}

export function groupCardsByCategory(cards: BangumiCard[]): BangumiCategoryGroups {
	const groups: BangumiCategoryGroups = {};
	for (const card of cards) {
		if (!groups[card.category]) {
			groups[card.category] = [];
		}
		groups[card.category].push(card);
	}
	return groups;
}
