import { getImage } from "astro:assets";
import { siteConfig } from "@/config";
import { getSortedPosts } from "@/utils/content-utils";
import { fetchDbPostsAll } from "@/utils/blog-db";
import rss from "@astrojs/rss";
import type { RSSFeedItem } from "@astrojs/rss";
import type { APIContext, ImageMetadata } from "astro";
import MarkdownIt from "markdown-it";
import { parse as htmlParser } from "node-html-parser";
import sanitizeHtml from "sanitize-html";

// 动态生成（混合数据源：md 文章 + 数据库文章）
export const prerender = false;

const markdownParser = new MarkdownIt();

// get dynamic import of images as a map collection
const imagesGlob = import.meta.glob<{ default: ImageMetadata }>(
	"/src/content/**/*.{jpeg,jpg,png,gif,webp}", // include posts and assets
);

export async function GET(context: APIContext): Promise<Response> {
	if (!context.site) {
		throw Error("site not set");
	}

	// Use the same ordering as site listing (pinned first, then by published desc)
	const posts = await getSortedPosts();
	// 数据库文章（后端不可用时为空数组）
	const dbPosts = await fetchDbPostsAll();
	const feed: RSSFeedItem[] = [];

	for (const post of posts) {
		// convert markdown to html string
		const body = markdownParser.render(post.body || "");
		// convert html string to DOM-like structure
		const html = htmlParser.parse(body);
		// hold all img tags in variable images
		const images = html.querySelectorAll("img");

		for (const img of images) {
			const src = img.getAttribute("src");
			if (!src) continue;

			// Handle content-relative images and convert them to built _astro paths
			if (src.startsWith("./") || src.startsWith("../")) {
				let importPath: string | null = null;

				if (src.startsWith("./")) {
					// Path relative to the post file directory
					const prefixRemoved = src.slice(2);
					importPath = `/src/content/posts/${prefixRemoved}`;
				} else {
					// Path like /public/assets/images/xxx -> relative to /src/content/
					const cleaned = src.replace(/^\.\.\//, "");
					importPath = `/src/content/${cleaned}`;
				}

				const imageMod = await imagesGlob[importPath]?.()?.then(
					(res) => res.default,
				);
				if (imageMod) {
					const optimizedImg = await getImage({ src: imageMod });
					img.setAttribute("src", new URL(optimizedImg.src, context.site).href);
				}
			} else if (src.startsWith("/")) {
				// images starting with `/` are in public dir
				img.setAttribute("src", new URL(src, context.site).href);
			}
		}

		feed.push({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.published,
			link: new URL(`posts/${post.id}/`, context.site).href,
			// sanitize the new html string with corrected image paths
			content: sanitizeHtml(html.toString(), {
				allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
			}),
		});
	}

	// 数据库文章（图片为绝对 URL，直接渲染摘要预览）
	for (const post of dbPosts) {
		feed.push({
			title: post.title,
			description: post.description,
			pubDate: new Date(post.publishedAt ?? post.updatedAt),
			link: new URL(`posts/${post.slug}/`, context.site).href,
			content: sanitizeHtml(
				markdownParser.render(post.contentPreview ?? post.description ?? ""),
				{
					allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
				},
			),
		});
	}

	feed.sort((a, b) => (b.pubDate?.getTime() ?? 0) - (a.pubDate?.getTime() ?? 0));

	return rss({
		title: siteConfig.title,
		description: siteConfig.subtitle || "No description",
		site: context.site,
		items: feed,
		customData: `<language>${siteConfig.lang}</language>`,
	});
}
