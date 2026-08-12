export interface BangumiRssItem {
	category: string;
	subjectId: string;
	title: string;
	coverUrl: string;
	pubDate: string;
}

function decodeEntities(text: string): string {
	return text
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&apos;", "'")
		.replaceAll("&amp;", "&");
}

export function parseBangumiRss(xml: string): BangumiRssItem[] {
	const items: BangumiRssItem[] = [];
	const itemRegex = /<item>([\s\S]*?)<\/item>/g;
	let match: RegExpExecArray | null;

	while ((match = itemRegex.exec(xml)) !== null) {
		const block = match[1];

		const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(block);
		const linkMatch = /<guid>([\s\S]*?)<\/guid>/.exec(block) ?? /<link>([\s\S]*?)<\/link>/.exec(block);
		const pubDateMatch = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(block);
		const imgMatch = /<img src="([^"]+)"/.exec(block);

		if (!titleMatch || !linkMatch) continue;

		const rawTitle = decodeEntities(titleMatch[1]).trim();
		const title = rawTitle.includes(":") ? rawTitle.slice(rawTitle.indexOf(":") + 1).trim() : rawTitle;
		const category = rawTitle.includes(":") ? rawTitle.slice(0, rawTitle.indexOf(":")).trim() : "";

		const link = decodeEntities(linkMatch[1]).trim();
		const subjectIdMatch = /\/(\d+)\/?$/.exec(link);
		if (!subjectIdMatch) continue;

		const rawCover = imgMatch ? imgMatch[1] : "";
		const coverUrl = rawCover.startsWith("//") ? `https:${rawCover}` : rawCover;

		items.push({
			category,
			subjectId: subjectIdMatch[1],
			title,
			coverUrl,
			pubDate: pubDateMatch ? pubDateMatch[1].trim() : "",
		});
	}

	return items;
}
