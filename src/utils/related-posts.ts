/**
 * 相关文章推荐。
 *
 * 打分策略：
 * 1. 与当前文章标签重合数（越多越相关）；
 * 2. 平局时按发布时间新的在前。
 * 排除自身，返回前 count 篇。
 */
export interface RelatedPostSource {
	slug: string;
	title: string;
	tags: string[];
	published: Date;
}

export function computeRelatedPosts(
	current: RelatedPostSource,
	posts: RelatedPostSource[],
	count = 3,
): RelatedPostSource[] {
	const currentTags = new Set(current.tags);

	const scored = posts
		.filter((p) => p.slug !== current.slug)
		.map((p) => {
			const overlap = p.tags.filter((tag) => currentTags.has(tag)).length;
			return { post: p, overlap };
		})
		.sort(
			(a, b) =>
				b.overlap - a.overlap ||
				b.post.published.getTime() - a.post.published.getTime(),
		);

	return scored.slice(0, count).map((entry) => entry.post);
}
