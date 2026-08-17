import type { CollectionEntry } from "astro:content";
import type { MarkdownHeading } from "astro";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeExternalLinks from "rehype-external-links";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import remarkDirective from "remark-directive";
import remarkMath from "remark-math";
import remarkSectionize from "remark-sectionize";
import { visit } from "unist-util-visit";
import { BLOG_API_BASE, type BlogPost } from "@/blog/api";
import { parseDirectiveNode } from "@/plugins/remark-directive-rehype";
import { remarkGithubAdmonitions } from "@/plugins/remark-github-admonitions";
import rehypeImagePlaceholder from "@/plugins/rehype-image-placeholder";

/**
 * 混合数据源工具：现有 md 文章（content collection）+ 数据库文章（博客后端）合并。
 * 所有对外请求均容错——后端不可用时退回纯 md 数据。
 */

export type DbPostMeta = Omit<BlogPost, "content"> & {
	/** 列表接口返回的正文预览（前 300 字符），用于阅读时长/摘要估算 */
	contentPreview?: string;
};
export interface DbPostFull extends BlogPost {}

const FETCH_TIMEOUT_MS = 4000;

async function fetchJson<T>(path: string): Promise<T | null> {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
		try {
			const response = await fetch(`${BLOG_API_BASE}${path}`, {
				headers: { Accept: "application/json" },
				signal: controller.signal,
			});
			if (!response.ok) return null;
			return (await response.json()) as T;
		} finally {
			clearTimeout(timer);
		}
	} catch {
		return null;
	}
}

/** 拉取全部已公开的数据库文章（分页循环，最多 1000 篇） */
export async function fetchDbPostsAll(): Promise<DbPostMeta[]> {
	const all: DbPostMeta[] = [];
	let page = 1;
	for (let i = 0; i < 20; i++) {
		const data = await fetchJson<{
			items: DbPostMeta[];
			total: number;
		}>(`/api/public/posts?page=${page}&pageSize=50`);
		if (!data || data.items.length === 0) break;
		all.push(...data.items);
		if (all.length >= data.total) break;
		page++;
	}
	return all;
}

/** 按 slug 拉取单篇数据库文章 */
export async function fetchDbPost(slug: string): Promise<DbPostFull | null> {
	return fetchJson<{ post: DbPostFull }>(
		`/api/public/posts/${encodeURIComponent(slug)}`,
	).then((data) => data?.post ?? null);
}

/** 估算阅读分钟数（中文 400 字/分钟） */
export function estimateMinutes(markdown: string): number {
	const plain = markdown
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/!\[[^\]]*]\([^)]*\)/g, " ")
		.replace(/[#>*_\-~`]/g, " ")
		.replace(/\s+/g, "");
	const cjk = (plain.match(/[\u4e00-\u9fff]/g) ?? []).length;
	const words = plain.length;
	return Math.max(1, Math.round(cjk / 400 + words / 1200));
}

/**
 * 把数据库文章转换为 content collection 的伪 entry，
 * 供 PostPage/PostCard 等现有组件复用（以 __source: "db" 标记）。
 */
export function toCollectionEntry(
	post: DbPostMeta,
): CollectionEntry<"posts"> & { __source: "db" } {
	const published = post.publishedAt ? new Date(post.publishedAt) : new Date(0);
	return {
		id: post.slug,
		slug: post.slug,
		body: post.contentPreview ?? "",
		collection: "posts",
		render: undefined,
		data: {
			title: post.title,
			published,
			updated: post.updatedAt ? new Date(post.updatedAt) : published,
			draft: false,
			description: post.description,
			image: post.image,
			// 防御：后端 tags 可能为 null/undefined，统一规范为数组
			tags: Array.isArray(post.tags) ? post.tags : [],
			lang: "",
			pinned: false,
			prevTitle: "",
			prevSlug: "",
			nextTitle: "",
			nextSlug: "",
		},
		__source: "db",
	} as unknown as CollectionEntry<"posts"> & { __source: "db" };
}

// remark-spoiler：与 astro.config.mjs 内联实现一致
function remarkSpoiler() {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return (tree: any) => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		visit(tree, "paragraph", (node: any) => {
			const newChildren: unknown[] = [];
			let inSpoiler = false;
			const hasSpoiler = node.children.some(
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(child: any) =>
					child.type === "text" && !!child.value && child.value.includes("||"),
			);
			if (!hasSpoiler) return;
			for (const child of node.children) {
				const textChild = child as { type?: string; value?: string };
				if (textChild.type === "text") {
					const parts = textChild.value!.split("||");
					if (parts.length === 1) {
						newChildren.push(child);
						continue;
					}
					parts.forEach((part, index) => {
						if (part) newChildren.push({ type: "text", value: part });
						if (index < parts.length - 1) {
							if (!inSpoiler) {
								newChildren.push({
									type: "html",
									value: '<span class="spoiler" title="点击显示">',
								});
								inSpoiler = true;
							} else {
								newChildren.push({ type: "html", value: "</span>" });
								inSpoiler = false;
							}
						}
					});
				} else {
					newChildren.push(child);
				}
			}
			if (inSpoiler) newChildren.push({ type: "html", value: "</span>" });
			(node as { children: unknown[] }).children = newChildren;
		});
	};
}

/**
 * 渲染数据库文章的 Markdown（复用站点的 remark/rehype 插件子集）。
 * 注意：依赖 Astro 组件渲染的 rehype-components（github/url 卡片、告警组件）不适用，
 * 其余（数学、锚点、外链、spoiler、github 告警语法）均保持一致。
 */
let processorPromise: ReturnType<typeof createMarkdownProcessor> | null = null;

async function getMarkdownProcessor(): Promise<Awaited<ReturnType<typeof createMarkdownProcessor>>> {
	if (!processorPromise) {
		processorPromise = createMarkdownProcessor({
			syntaxHighlight: false,
			gfm: true,
			remarkPlugins: [
				remarkSpoiler,
				remarkMath,
				remarkGithubAdmonitions,
				remarkDirective,
				remarkSectionize,
				parseDirectiveNode,
			],
			rehypePlugins: [
				rehypeKatex,
				rehypeSlug,
				rehypeExternalLinks,
				[
					rehypeAutolinkHeadings,
					{
						behavior: "append",
						properties: {
							className: ["anchor"],
						},
					},
				],
				rehypeImagePlaceholder,
			],
		});
	}
	return processorPromise;
}

export async function renderDbMarkdown(
	content: string,
): Promise<{ html: string; headings: MarkdownHeading[] }> {
	const processor = await getMarkdownProcessor();
	const { code, metadata } = await processor.render(content);
	return {
		html: code,
		headings: (metadata.headings ?? []) as MarkdownHeading[],
	};
}
