import { buildBangumiCards, type BangumiCard } from "./bangumi-cards";
import { parseBangumiRss } from "./bangumi-rss";
import type { BangumiSubjectDetail } from "./bangumi-cards";

const RSS_URL = "https://bgm.tv/feed/user/1272604/interests";
const SUBJECT_API = "https://api.bgm.tv/v0/subjects/";
const FETCH_TIMEOUT_MS = 5000;
const CONCURRENCY = 5;

async function fetchWithTimeout(url: string): Promise<string | null> {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
		try {
			const response = await fetch(url, { signal: controller.signal });
			if (!response.ok) return null;
			return await response.text();
		} finally {
			clearTimeout(timer);
		}
	} catch {
		return null;
	}
}

async function runPool<T>(
	items: T[],
	concurrency: number,
	worker: (item: T) => Promise<void>,
): Promise<void> {
	let index = 0;
	async function next() {
		while (index < items.length) {
			const current = index++;
			await worker(items[current]);
		}
	}
	const workers = Array.from(
		{ length: Math.min(concurrency, items.length) },
		() => next(),
	);
	await Promise.all(workers);
}

export async function fetchBangumiCards(): Promise<BangumiCard[]> {
	const rssText = await fetchWithTimeout(RSS_URL);
	if (!rssText) return [];

	const items = parseBangumiRss(rssText);
	if (items.length === 0) return [];

	const details = new Map<number, BangumiSubjectDetail>();
	await runPool(items, CONCURRENCY, async (item) => {
		const json = await fetchWithTimeout(`${SUBJECT_API}${item.subjectId}`);
		if (!json) return;
		try {
			const detail = JSON.parse(json) as BangumiSubjectDetail;
			details.set(Number(item.subjectId), detail);
		} catch {
			// 忽略单个条目解析失败，降级为仅 RSS 字段
		}
	});

	return buildBangumiCards(items, details);
}
