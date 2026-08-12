import type { CollectionEntry } from "astro:content";
import type { BlogPost } from "@/blog/api";

export type DbPostMetaLike = Pick<
	BlogPost,
	"slug" | "title" | "publishedAt"
> & {
	pinned?: boolean;
};

export interface MergedPost {
	slug: string;
	title: string;
	published: Date;
	pinned: boolean;
	source: "md" | "db";
}

export interface PrevNextLink {
	slug: string;
	title: string;
}

export interface PrevNext {
	prev: PrevNextLink | null;
	next: PrevNextLink | null;
}

function toMergedPost(
	mdPost: CollectionEntry<"posts">,
): MergedPost {
	return {
		slug: mdPost.id,
		title: mdPost.data.title,
		published: new Date(mdPost.data.published),
		pinned: mdPost.data.pinned === true,
		source: "md",
	};
}

function toMergedPostFromDb(post: DbPostMetaLike): MergedPost {
	const published = post.publishedAt
		? new Date(post.publishedAt)
		: new Date(0);
	return {
		slug: post.slug,
		title: post.title,
		published,
		pinned: post.pinned === true,
		source: "db",
	};
}

export function mergeSortedPosts(input: {
	mdPosts: CollectionEntry<"posts">[];
	dbPosts: DbPostMetaLike[];
}): MergedPost[] {
	const md = input.mdPosts.map(toMergedPost);
	const db = input.dbPosts.map(toMergedPostFromDb);
	return [...db, ...md].sort((a, b) => {
		if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
		return b.published.getTime() - a.published.getTime();
	});
}

export function computePrevNext(
	merged: MergedPost[],
	currentSlug: string,
): PrevNext {
	const index = merged.findIndex((post) => post.slug === currentSlug);
	if (index < 0) return { prev: null, next: null };
	const prev = index > 0 ? merged[index - 1] : null;
	const next = index < merged.length - 1 ? merged[index + 1] : null;
	return {
		prev: prev ? { slug: prev.slug, title: prev.title } : null,
		next: next ? { slug: next.slug, title: next.title } : null,
	};
}
