import { writable } from "svelte/store";
import { authApi, type BlogUser } from "@/blog/api";

interface AuthState {
	user: BlogUser | null;
	loading: boolean;
}

interface AuthStore {
	subscribe: ReturnType<typeof writable<AuthState>>["subscribe"];
	refresh(): Promise<void>;
	setUser(user: BlogUser): void;
	clear(): void;
}

// 登录态本地缓存：整页刷新/导航后先用缓存立即渲染顶部登录按钮（免去等待
// /session 请求期间的 loading 占位），再由 refresh() 后台校验并更新缓存。
// 缓存仅存公开的用户概要（无 token），登出/校验失败时清除。
const CACHE_KEY = "fuwari:blog-auth-user";

function readCachedUser(): BlogUser | null {
	try {
		if (typeof localStorage === "undefined") return null;
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as BlogUser;
		return parsed && typeof parsed.id === "number" ? parsed : null;
	} catch {
		return null;
	}
}

function writeCachedUser(user: BlogUser | null): void {
	try {
		if (typeof localStorage === "undefined") return;
		if (user) localStorage.setItem(CACHE_KEY, JSON.stringify(user));
		else localStorage.removeItem(CACHE_KEY);
	} catch {
		// 存储不可用（隐私模式等）时静默降级
	}
}

function createAuthStore(): AuthStore {
	const { subscribe, set, update } = writable<AuthState>({
		// SSR 阶段无缓存无请求上下文：loading=true 让 AuthNav 渲染中性占位；
		// 客户端 hydrate 时同步读缓存立即渲染，无需等待 /session 返回。
		user: readCachedUser(),
		loading: import.meta.env.SSR,
	});

	// 登录态只初始化一次：首次需要时请求 /session 校验，此后由 setUser/clear
	// 维护，避免页面切换/挂载时反复请求导致顶部登录按钮反复消失再显示。
	let initialized = false;

	return {
		subscribe,
		async refresh(): Promise<void> {
			if (initialized) return;
			initialized = true;
			try {
				const { user } = await authApi.getSession();
				set({ user, loading: false });
				writeCachedUser(user);
			} catch {
				// 网络/服务异常时保留缓存登录态，避免误登出；仅结束 loading
				update((state) => ({ ...state, loading: false }));
			}
		},
		setUser(user: BlogUser): void {
			initialized = true;
			writeCachedUser(user);
			update((state) => ({ ...state, user, loading: false }));
		},
		clear(): void {
			initialized = true;
			writeCachedUser(null);
			set({ user: null, loading: false });
		},
	};
}

export const blogAuth: ReturnType<typeof createAuthStore> = createAuthStore();
