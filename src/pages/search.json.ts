import { getSortedPosts } from "@/utils/content-utils";
import { fetchDbPostsAll } from "@/utils/blog-db";
import type { APIContext } from "astro";

// 动态生成（混合数据源）
export const prerender = false;

function toPlainText(markdown: string): string {
	return markdown
		.replace(/!\[[^\]]*]\([^)]*\)/g, " ")
		.replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`[^`]*`/g, " ")
		.replace(/<[^>]*>/g, " ")
		.replace(/[#>*_\-~]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export async function GET(_context: APIContext): Promise<Response> {
	const posts = await getSortedPosts();
	const payload = posts.map((post) => ({
		title: post.data.title || "",
		description: post.data.description || "",
		content: toPlainText(post.body || ""),
		link: post.id,
		published: post.data.published ? post.data.published.toISOString() : "",
	}));

	// 数据库文章合并进搜索索引（预览正文）
	const dbPosts = await fetchDbPostsAll();
	for (const post of dbPosts) {
		payload.push({
			title: post.title || "",
			description: post.description || "",
			content: toPlainText(post.contentPreview ?? ""),
			link: post.slug,
			published: post.publishedAt || "",
		});
	}

	return new Response(JSON.stringify(payload), {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "public, max-age=600",
		},
	});
}
