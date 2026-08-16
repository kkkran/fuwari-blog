import { getCollection } from "astro:content";
import { fetchDbPostsAll } from "@/utils/blog-db";
import { getStaticSitemapPages, type SitemapPage } from "@/utils/sitemap-utils";
import type { APIRoute } from "astro";

// 动态生成（混合数据源，含数据库文章 slug）
export const prerender = false;

export const GET: APIRoute = async () => {
	const posts = await getCollection("posts", ({ data }) => {
		return !data.draft;
	});

	const staticPages: SitemapPage[] = getStaticSitemapPages();

	const postPages: SitemapPage[] = posts.map((post) => ({
		url: `/posts/${post.id}/`,
		priority: 0.7,
		changefreq: "weekly",
		lastmod: post.data.updated || post.data.published,
	}));

	// 数据库文章
	const dbPosts = await fetchDbPostsAll();
	for (const post of dbPosts) {
		postPages.push({
			url: `/posts/${post.slug}/`,
			priority: 0.7,
			changefreq: "weekly",
			lastmod: post.updatedAt ? new Date(post.updatedAt) : undefined,
		});
	}

	const allPages: SitemapPage[] = [...staticPages, ...postPages];

	const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages
	.map((page) => {
		const loc = `	<loc>${new URL(page.url, import.meta.env.SITE).href}</loc>`;
		const priority = `	<priority>${page.priority}</priority>`;
		const changefreq = `	<changefreq>${page.changefreq}</changefreq>`;
		const lastmod = page.lastmod
			? `	<lastmod>${new Date(page.lastmod).toISOString().split("T")[0]}</lastmod>`
			: "";
		return `	<url>
${loc}
${priority}
${changefreq}${lastmod ? `\n${lastmod}` : ""}
	</url>`;
	})
	.join("\n")}
</urlset>`.trim();

	return new Response(sitemap, {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
		},
	});
};
