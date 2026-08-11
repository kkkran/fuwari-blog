export type UserRole = "user" | "admin";

export interface User {
	id: number;
	email: string | null;
	displayName: string;
	avatarUrl: string;
	githubId: string | null;
	role: UserRole;
	createdAt: string;
}

export type PostStatus = "pending" | "approved" | "rejected";

export interface PostRecord {
	id: number;
	slug: string;
	title: string;
	description: string;
	image: string;
	tags: string[];
	content: string;
	status: PostStatus;
	authorId: number;
	authorName: string;
	rejectReason: string;
	createdAt: string;
	updatedAt: string;
	publishedAt: string | null;
}

export interface PostDraft {
	slug: string;
	title: string;
	description: string;
	image: string;
	tags: string[];
	content: string;
}
