/**
 * sitemap 静态页面清单（不含文章，文章由 sitemap.xml.ts 动态合并）。
 * 仅收录真实存在且对 SEO 有意义的路径，避免死链浪费抓取配额。
 */
export interface SitemapPage {
	url: string;
	priority: number;
	changefreq: "daily" | "weekly" | "monthly" | "yearly";
	lastmod?: Date;
}

export function getStaticSitemapPages(): SitemapPage[] {
	return [
		{ url: "/", priority: 1.0, changefreq: "daily" },
		{ url: "/blog/", priority: 0.8, changefreq: "daily" },
		{ url: "/archive/", priority: 0.8, changefreq: "weekly" },
		{ url: "/friends/", priority: 0.6, changefreq: "monthly" },
		{ url: "/tools/", priority: 0.6, changefreq: "monthly" },
		{ url: "/tools/gallery/", priority: 0.6, changefreq: "monthly" },
		{ url: "/bangumi/", priority: 0.5, changefreq: "monthly" },
		{ url: "/sponsors/", priority: 0.5, changefreq: "monthly" },
	];
}
