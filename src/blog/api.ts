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

/** 请求超时信号（每次调用生成新信号，AbortSignal 只能中止一次）：
 *  公网链路（frp 隧道）偶发卡顿，避免上传请求无限挂起 */
function createTimeoutSignal(): AbortSignal {
	return AbortSignal.timeout(25_000);
}

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

// ---------- 友链 ----------

export interface FriendEntry {
	id: number;
	siteName: string;
	url: string;
	description: string;
	avatar: string;
	date: string;
}

export interface FriendPendingItem {
	id: number;
	siteName: string;
	url: string;
	description: string;
	avatar: string;
	email: string | null;
	sourceIp: string;
	createdAt: string;
}

export const friendsApi = {
	list(): Promise<{ friends: FriendEntry[] }> {
		return request<{ friends: FriendEntry[] }>("/api/friends");
	},
	apply(input: {
		siteName: string;
		url: string;
		description: string;
		avatar: string;
	}): Promise<{ friend: { status: string } }> {
		return request<{ friend: { status: string } }>("/api/friends", {
			method: "POST",
			body: JSON.stringify(input),
		});
	},
};

export const friendsAdminApi = {
	pending(): Promise<{ items: FriendPendingItem[] }> {
		return request<{ items: FriendPendingItem[] }>("/api/friends/pending");
	},
	approve(id: number): Promise<{ friend: FriendEntry }> {
		return request<{ friend: FriendEntry }>(`/api/friends/${id}/approve`, {
			method: "POST",
		});
	},
	reject(id: number): Promise<{ ok: boolean }> {
		return request<{ ok: boolean }>(`/api/friends/${id}/reject`, {
			method: "POST",
		});
	},
	remove(id: number): Promise<{ ok: boolean }> {
		return request<{ ok: boolean }>(`/api/friends/${id}`, {
			method: "DELETE",
		});
	},
};

// ---------- AI（互动小说 / 图片生成） ----------

export interface AiStoryListItem {
	id: number;
	title: string;
	genre: string;
	entries: number;
	updatedAt: string;
}

export interface AiStoryEntry {
	id: number;
	seq: number;
	content: string;
	choices: string[];
	chosen: string;
	createdAt: string;
}

export interface AiImageItem {
	id: number;
	prompt: string;
	ratio: string;
	style: string;
	url: string;
	createdAt: string;
}

export interface AiQuota {
	storyCreate: number;
	storyContinue: number;
	imageGenerate: number;
}

export const aiStoryApi = {
	create(genre: string): Promise<{
		story: { id: number; title: string; genre: string; content: string; choices: string[] };
	}> {
		return request<{
			story: { id: number; title: string; genre: string; content: string; choices: string[] };
		}>("/api/ai/stories", {
			method: "POST",
			body: JSON.stringify({ genre }),
		});
	},
	list(): Promise<{ stories: AiStoryListItem[] }> {
		return request<{ stories: AiStoryListItem[] }>("/api/ai/stories");
	},
	detail(id: number): Promise<{
		story: { id: number; title: string; genre: string };
		entries: AiStoryEntry[];
	}> {
		return request<{
			story: { id: number; title: string; genre: string };
			entries: AiStoryEntry[];
		}>(`/api/ai/stories/${id}`);
	},
	continue(id: number, choice: string): Promise<{
		entry: { seq: number; content: string; choices: string[]; chosen: string };
	}> {
		return request<{
			entry: { seq: number; content: string; choices: string[]; chosen: string };
		}>(`/api/ai/stories/${id}/continue`, {
			method: "POST",
			body: JSON.stringify({ choice }),
		});
	},
	remove(id: number): Promise<{ ok: boolean }> {
		return request<{ ok: boolean }>(`/api/ai/stories/${id}`, {
			method: "DELETE",
		});
	},
};

export const aiImageApi = {
	generate(input: {
		prompt: string;
		ratio: string;
		style: string;
	}): Promise<{
		image: { id: number; prompt: string; ratio: string; style: string; url: string };
	}> {
		return request<{
			image: { id: number; prompt: string; ratio: string; style: string; url: string };
		}>("/api/ai/images", {
			method: "POST",
			body: JSON.stringify(input),
		});
	},
	list(): Promise<{ images: AiImageItem[] }> {
		return request<{ images: AiImageItem[] }>("/api/ai/images");
	},
	remove(id: number): Promise<{ ok: boolean }> {
		return request<{ ok: boolean }>(`/api/ai/images/${id}`, {
			method: "DELETE",
		});
	},
	quota(): Promise<{ quota: AiQuota }> {
		return request<{ quota: AiQuota }>("/api/ai/quota");
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

// ---------- txt 分享（Clash 配置） ----------

export interface ShareFileItem {
	id: string;
	filename: string;
	status: "approved" | "pending";
	size: number;
	rawUrl: string;
	expiresAt: string | null;
	createdAt: string;
}

export interface ShareItemBase {
	id: string;
	filename: string;
	size: number;
	createdAt: string;
}

/** 后端返回相对路径时拼成完整公网地址（Clash 客户端需要绝对 URL） */
function toShareUrl(rawUrl: string): string {
	return rawUrl.startsWith("http") ? rawUrl : `${BLOG_API_BASE}${rawUrl}`;
}

export const shareApi = {
	/** 上传 txt，expiresInDays ∈ {0,1,7,30}（0=永久，缺省 7）。
	 *  自带 25s 超时与 5xx 自动重试一次：公网链路（frp 隧道）偶发卡顿/连接重置时自愈，
	 *  超时与网络错误给出可区分的提示。 */
	async upload(file: File, expiresInDays: number): Promise<{ id: string; rawUrl: string; status: "approved" | "pending" }> {
		const form = new FormData();
		form.append("file", file);
		form.append("expiresInDays", String(expiresInDays));

		const doFetch = async (): Promise<Response> => {
			try {
				return await fetch(`${BLOG_API_BASE}/api/share`, {
					method: "POST",
					body: form,
					credentials: "include",
					signal: createTimeoutSignal(),
				});
			} catch (error) {
				if (error instanceof DOMException && error.name === "AbortError") {
					throw new BlogApiError("上传超时，请稍后重试", 0);
				}
				throw new BlogApiError("无法连接博客服务，请检查网络后重试", 0);
			}
		};

		let response: Response;
		try {
			response = await doFetch();
		} catch (error) {
			throw error;
		}
		// 5xx（链路/网关类错误）自动重试一次；4xx（业务拒绝）不重试
		if (response.status >= 500) {
			try {
				response = await doFetch();
			} catch (error) {
				throw error;
			}
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
		const data = (await response.json()) as { id: string; rawUrl: string; status: "approved" | "pending" };
		return { ...data, rawUrl: toShareUrl(data.rawUrl) };
	},

	async my(): Promise<{ files: ShareFileItem[] }> {
		const data = await request<{ files: ShareFileItem[] }>("/api/share/my");
		return { files: data.files.map((f) => ({ ...f, rawUrl: toShareUrl(f.rawUrl) })) };
	},

	async remove(id: string): Promise<void> {
		let response: Response;
		try {
			response = await fetch(`${BLOG_API_BASE}/api/share/${id}`, {
				method: "DELETE",
				credentials: "include",
			});
		} catch {
			throw new BlogApiError("无法连接博客服务，请稍后再试", 0);
		}
		if (!response.ok) {
			let message = `删除失败（${response.status}）`;
			try {
				const data = (await response.json()) as { error?: string };
				if (data.error) message = data.error;
			} catch {
				// 非 JSON 响应
			}
			throw new BlogApiError(message, response.status);
		}
	},
};

export const shareAdminApi = {
	async pending(): Promise<
		{ files: (ShareItemBase & { email: string; status: string })[] }
	> {
		return request<{ files: (ShareItemBase & { email: string; status: string })[] }>(
			"/api/share/admin/pending",
		);
	},
	async content(id: string): Promise<string> {
		const response = await fetch(`${BLOG_API_BASE}/api/share/admin/${id}/content`, {
			credentials: "include",
		});
		if (!response.ok) throw new BlogApiError(`读取失败（${response.status}）`, response.status);
		return response.text();
	},
	async approve(id: string): Promise<void> {
		await request<{ ok: boolean }>(`/api/share/admin/${id}/approve`, {
			method: "POST",
		});
	},
	async reject(id: string): Promise<void> {
		await request<{ ok: boolean }>(`/api/share/admin/${id}/reject`, {
			method: "POST",
		});
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
