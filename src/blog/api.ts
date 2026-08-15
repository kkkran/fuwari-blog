import { serviceConfig } from "@/config";

// 开发环境浏览器端走 Astro dev 代理（/api、/uploads → http://127.0.0.1:3001，见
// astro.config.mjs vite.server.proxy）：请求与页面同源，会话 Cookie 可正常写入/携带。
// 若直接跨站请求 127.0.0.1:3001（如从 localhost:4321 访问），浏览器会因
// SameSite=Lax 拒绝设置/携带 Cookie，导致登录态无法持久化。
// SSR 端（博客列表/详情等服务端渲染）与生产环境仍使用绝对地址。
export const BLOG_API_BASE: string =
	import.meta.env.DEV && !import.meta.env.SSR
		? ""
		: serviceConfig.blogApiBaseUrl;

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
	register(input: {
		email: string;
		password: string;
		displayName: string;
	}): Promise<{ user: BlogUser }> {
		return request<{ user: BlogUser }>("/api/auth/register", {
			method: "POST",
			body: JSON.stringify(input),
		});
	},
	login(input: { email: string; password: string }): Promise<{ user: BlogUser }> {
		return request<{ user: BlogUser }>("/api/auth/login", {
			method: "POST",
			body: JSON.stringify(input),
		});
	},
	logout(): Promise<{ ok: boolean }> {
		return request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
	},
	getSession(): Promise<{ user: BlogUser | null }> {
		return request<{ user: BlogUser | null }>("/api/auth/session");
	},
	getProviders(): Promise<{ github: boolean }> {
		return request<{ github: boolean }>("/api/auth/providers");
	},
};

// ---------- 博客 ----------

export const blogApi = {
	create(input: PostDraft): Promise<{ post: BlogPost }> {
		return request<{ post: BlogPost }>("/api/blog/posts", {
			method: "POST",
			body: JSON.stringify(input),
		});
	},
	update(slug: string, input: PostDraft): Promise<{ post: BlogPost }> {
		return request<{ post: BlogPost }>(`/api/blog/posts/${encodeURIComponent(slug)}`, {
			method: "PUT",
			body: JSON.stringify(input),
		});
	},
	mine(): Promise<{ items: BlogPost[] }> {
		return request<{ items: BlogPost[] }>("/api/blog/posts/mine");
	},
	getMine(slug: string): Promise<{ post: BlogPost }> {
		return request<{ post: BlogPost }>(`/api/blog/posts/${encodeURIComponent(slug)}`);
	},
	remove(slug: string): Promise<{ ok: boolean }> {
		return request<{ ok: boolean }>(`/api/blog/posts/${encodeURIComponent(slug)}`, {
			method: "DELETE",
		});
	},
	// admin
	listByStatus(status: PostStatus): Promise<{ items: BlogPost[] }> {
		return request<{ items: BlogPost[] }>(
			`/api/blog/posts?status=${encodeURIComponent(status)}`,
		);
	},
	approve(slug: string): Promise<{ ok: boolean }> {
		return request<{ ok: boolean }>(
			`/api/blog/posts/${encodeURIComponent(slug)}/approve`,
			{ method: "POST" },
		);
	},
	reject(slug: string, reason: string): Promise<{ ok: boolean }> {
		return request<{ ok: boolean }>(
			`/api/blog/posts/${encodeURIComponent(slug)}/reject`,
			{ method: "POST", body: JSON.stringify({ reason }) },
		);
	},
};

// ---------- 赞助 ----------

export interface SponsorEntry {
	id: number;
	displayName: string;
	avatarUrl: string | null;
	amount: number;
	amountText: string;
	anonymous: boolean;
	date: string;
}

export interface SponsorStats {
	count: number;
	amount: number;
}

export const sponsorsApi = {
	list(): Promise<{ sponsors: SponsorEntry[] }> {
		return request<{ sponsors: SponsorEntry[] }>("/api/sponsors");
	},
	stats(): Promise<SponsorStats> {
		return request<SponsorStats>("/api/sponsors/stats");
	},
	submit(input: {
		displayName: string;
		amount: number;
		anonymous: boolean;
		remark: string;
	}): Promise<{ sponsor: { status: string } }> {
		return request<{ sponsor: { status: string } }>("/api/sponsors", {
			method: "POST",
			body: JSON.stringify(input),
		});
	},
};

export interface SponsorPendingItem {
	id: number;
	displayName: string;
	amount: number;
	amountText: string;
	anonymous: boolean;
	remark: string;
	sourceIp: string;
	email: string | null;
	createdAt: string;
}

export const sponsorsAdminApi = {
	pending(): Promise<{ items: SponsorPendingItem[] }> {
		return request<{ items: SponsorPendingItem[] }>("/api/sponsors/pending");
	},
	approve(id: number): Promise<{ sponsor: SponsorEntry }> {
		return request<{ sponsor: SponsorEntry }>(
			`/api/sponsors/${id}/approve`,
			{ method: "POST" },
		);
	},
	reject(id: number): Promise<{ ok: boolean }> {
		return request<{ ok: boolean }>(`/api/sponsors/${id}/reject`, {
			method: "POST",
		});
	},
	remove(id: number): Promise<{ ok: boolean }> {
		return request<{ ok: boolean }>(`/api/sponsors/${id}`, {
			method: "DELETE",
		});
	},
	update(
		id: number,
		input: { displayName?: string; amount?: number; anonymous?: boolean },
	): Promise<{ sponsor: SponsorEntry }> {
		return request<{ sponsor: SponsorEntry }>(`/api/sponsors/${id}`, {
			method: "PUT",
			body: JSON.stringify(input),
		});
	},
};

// ---------- 公开查询 ----------

export const publicApi = {
	list(
		page = 1,
		pageSize = 20,
	): Promise<{
		items: Omit<BlogPost, "content">[];
		total: number;
		page: number;
		pageSize: number;
	}> {
		return request<{
			items: Omit<BlogPost, "content">[];
			total: number;
			page: number;
			pageSize: number;
		}>(`/api/public/posts?page=${page}&pageSize=${pageSize}`);
	},
	get(slug: string): Promise<{ post: BlogPost }> {
		return request<{ post: BlogPost }>(`/api/public/posts/${encodeURIComponent(slug)}`);
	},
};

// ---------- 上传 ----------

export const uploadApi = {
	async uploadImage(file: File): Promise<string> {
		const form = new FormData();
		form.append("file", file);
		let response: Response;
		try {
			response = await fetch(`${BLOG_API_BASE}/api/upload`, {
				method: "POST",
				body: form,
				credentials: "include",
			});
		} catch {
			throw new BlogApiError("无法连接博客服务，请稍后再试", 0);
		}
		if (!response.ok) {
			let message = `上传失败（${response.status}）`;
			try {
				const data = (await response.json()) as { error?: string };
				if (data.error) message = data.error;
			} catch {
				// 非 JSON 响应
			}
			throw new BlogApiError(message, response.status);
		}
		const data = (await response.json()) as { url: string };
		// 后端返回的 URL 可能是绝对公网地址（图床 https://img.miscoke.top/...）
		// 也可能是相对路径（本地回退 /uploads/...）——相对路径才需要拼 API 域名
		return data.url.startsWith("http") ? data.url : `${BLOG_API_BASE}${data.url}`;
	},
};

// ---------- 通知 ----------

export const notificationApi = {
	unreadCount(): Promise<{ count: number }> {
		return request<{ count: number }>("/api/notifications/unread-count");
	},
	list(): Promise<{ items: BlogNotification[] }> {
		return request<{ items: BlogNotification[] }>("/api/notifications");
	},
	markRead(ids?: number[]): Promise<{ ok: boolean }> {
		return request<{ ok: boolean }>("/api/notifications/read", {
			method: "POST",
			body: JSON.stringify({ ids }),
		});
	},
};
