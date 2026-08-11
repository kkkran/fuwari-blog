import { serviceConfig } from "@/config";

export const BLOG_API_BASE = serviceConfig.blogApiBaseUrl;

export type BlogUserRole = "user" | "admin";

export interface BlogUser {
	id: number;
	email: string | null;
	displayName: string;
	avatarUrl: string;
	githubId: string | null;
	role: BlogUserRole;
	createdAt: string;
}

export type PostStatus = "pending" | "approved" | "rejected";

export interface BlogPost {
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
	slug?: string;
	title: string;
	description?: string;
	image?: string;
	tags?: string[];
	content: string;
}

export interface BlogNotification {
	id: number;
	type: string;
	message: string;
	read: boolean;
	createdAt: string;
}

export class BlogApiError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "BlogApiError";
		this.status = status;
	}
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
	let response: Response;
	try {
		response = await fetch(`${BLOG_API_BASE}${path}`, {
			...options,
			credentials: "include",
			headers: {
				"Content-Type": "application/json",
				...(options.headers ?? {}),
			},
		});
	} catch {
		throw new BlogApiError("无法连接博客服务，请稍后再试", 0);
	}
	if (!response.ok) {
		let message = `请求失败（${response.status}）`;
		try {
			const data = (await response.json()) as { error?: string };
			if (data.error) message = data.error;
		} catch {
			// 非 JSON 响应，保留默认消息
		}
		throw new BlogApiError(message, response.status);
	}
	return (await response.json()) as T;
}

// ---------- 认证 ----------

export const authApi = {
	register(input: { email: string; password: string; displayName: string }) {
		return request<{ user: BlogUser }>("/api/auth/register", {
			method: "POST",
			body: JSON.stringify(input),
		});
	},
	login(input: { email: string; password: string }) {
		return request<{ user: BlogUser }>("/api/auth/login", {
			method: "POST",
			body: JSON.stringify(input),
		});
	},
	logout() {
		return request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
	},
	getSession() {
		return request<{ user: BlogUser | null }>("/api/auth/session");
	},
	getProviders() {
		return request<{ github: boolean }>("/api/auth/providers");
	},
};

// ---------- 博客 ----------

export const blogApi = {
	create(input: PostDraft) {
		return request<{ post: BlogPost }>("/api/blog/posts", {
			method: "POST",
			body: JSON.stringify(input),
		});
	},
	update(slug: string, input: PostDraft) {
		return request<{ post: BlogPost }>(`/api/blog/posts/${encodeURIComponent(slug)}`, {
			method: "PUT",
			body: JSON.stringify(input),
		});
	},
	mine() {
		return request<{ items: BlogPost[] }>("/api/blog/posts/mine");
	},
	getMine(slug: string) {
		return request<{ post: BlogPost }>(`/api/blog/posts/${encodeURIComponent(slug)}`);
	},
	remove(slug: string) {
		return request<{ ok: boolean }>(`/api/blog/posts/${encodeURIComponent(slug)}`, {
			method: "DELETE",
		});
	},
	// admin
	listByStatus(status: PostStatus) {
		return request<{ items: BlogPost[] }>(
			`/api/blog/posts?status=${encodeURIComponent(status)}`,
		);
	},
	approve(slug: string) {
		return request<{ ok: boolean }>(
			`/api/blog/posts/${encodeURIComponent(slug)}/approve`,
			{ method: "POST" },
		);
	},
	reject(slug: string, reason: string) {
		return request<{ ok: boolean }>(
			`/api/blog/posts/${encodeURIComponent(slug)}/reject`,
			{ method: "POST", body: JSON.stringify({ reason }) },
		);
	},
};

// ---------- 公开查询 ----------

export const publicApi = {
	list(page = 1, pageSize = 20) {
		return request<{ items: Omit<BlogPost, "content">[]; total: number; page: number; pageSize: number }>(
			`/api/public/posts?page=${page}&pageSize=${pageSize}`,
		);
	},
	get(slug: string) {
		return request<{ post: BlogPost }>(`/api/public/posts/${encodeURIComponent(slug)}`);
	},
};

// ---------- 通知 ----------

export const notificationApi = {
	unreadCount() {
		return request<{ count: number }>("/api/notifications/unread-count");
	},
	list() {
		return request<{ items: BlogNotification[] }>("/api/notifications");
	},
	markRead(ids?: number[]) {
		return request<{ ok: boolean }>("/api/notifications/read", {
			method: "POST",
			body: JSON.stringify({ ids }),
		});
	},
};
