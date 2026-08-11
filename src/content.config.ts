import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";
import { parsePostDateToDate } from "./utils/date-utils";

const postsSchema: z.ZodType<{
	title: string;
	published: Date;
	updated?: Date;
	draft: boolean;
	description: string;
	image: string;
	tags: string[];
	lang: string;
	pinned: boolean;
	ai_level?: number;
	prevTitle: string;
	prevSlug: string;
	nextTitle: string;
	nextSlug: string;
}> = z.object({
	title: z.string(),
	published: z.preprocess(parsePostDateToDate, z.date()),
	updated: z.preprocess(parsePostDateToDate, z.date()).optional(),
	draft: z.boolean().optional().default(false),
	description: z.string().optional().default(""),
	image: z.string().optional().default(""),
	tags: z.array(z.string()).optional().default([]),
	lang: z.string().optional().default(""),
	pinned: z.boolean().optional().default(false),
	ai_level: z.number().int().min(1).max(3).optional(),
	prevTitle: z.string().default(""),
	prevSlug: z.string().default(""),
	nextTitle: z.string().default(""),
	nextSlug: z.string().default(""),
});

const postsCollection: ReturnType<typeof defineCollection<typeof postsSchema>> =
	defineCollection({
		loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/posts" }),
		schema: postsSchema,
	});

const specSchema: z.ZodType<{ enable: boolean; level: string }> = z.object({
	enable: z.boolean().optional().default(true),
	level: z.string().optional().default("info"),
});

const specCollection: ReturnType<typeof defineCollection<typeof specSchema>> =
	defineCollection({
		loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/spec" }),
		schema: specSchema,
	});

export const collections: {
	posts: typeof postsCollection;
	spec: typeof specCollection;
} = {
	posts: postsCollection,
	spec: specCollection,
};
