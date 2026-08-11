import type { APIRoute } from "astro";
import { getSortedPosts } from "../utils/content-utils";
import { fetchDbPostsAll } from "../utils/blog-db";

// 动态生成（混合数据源）
export const prerender = false;

export const GET: APIRoute = async () => {
	const posts = await getSortedPosts();
	const pathnames = posts.map((post) => `/posts/${post.id}`);

	const dbPosts = await fetchDbPostsAll();
	for (const post of dbPosts) {
		pathnames.push(`/posts/${post.slug}`);
	}

	return new Response(JSON.stringify(pathnames, null, 2), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
		},
	});
};
