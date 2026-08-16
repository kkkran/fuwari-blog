/**
 * 标签聚合工具：统计标签出现次数、按标签筛选文章。
 */

export interface TaggedSource {
	slug: string;
	title: string;
	tags: string[];
	published: Date;
}

export interface TagCount {
	tag: string;
	count: number;
}

export function collectTagCounts(posts: TaggedSource[]): TagCount[] {
	const map = new Map<string, number>();
	for (const post of posts) {
		for (const tag of post.tags) {
			map.set(tag, (map.get(tag) ?? 0) + 1);
		}
	}
	return [...map.entries()]
		.map(([tag, count]) => ({ tag, count }))
		.sort(
			(a, b) =>
				b.count - a.count ||
				(a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0),
		);
}

export function postsForTag(posts: TaggedSource[], tag: string): TaggedSource[] {
	return posts.filter((p) => p.tags.includes(tag));
}
