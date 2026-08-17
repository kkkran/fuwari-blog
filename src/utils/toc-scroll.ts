/**
 * 目录树滚动高亮判定。
 *
 * 给定各标题相对视口顶部的偏移（getBoundingClientRect().top），
 * 返回当前应高亮的标题索引：最后一个顶部已越过阈值线（导航栏下方）的标题；
 * 没有任何标题越过时返回 -1（不高亮）。
 */
export function computeActiveIndex(
	headingTops: number[],
	threshold: number,
): number {
	let active = -1;
	for (let i = 0; i < headingTops.length; i++) {
		if (headingTops[i] <= threshold) {
			active = i;
		} else {
			break;
		}
	}
	return active;
}
