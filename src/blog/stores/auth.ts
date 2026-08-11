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

function createAuthStore(): AuthStore {
	const { subscribe, set, update } = writable<AuthState>({
		user: null,
		loading: true,
	});

	// 登录态只初始化一次：首次需要时请求 /session，此后由 setUser/clear
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
			} catch {
				set({ user: null, loading: false });
			}
		},
		setUser(user: BlogUser): void {
			initialized = true;
			update((state) => ({ ...state, user, loading: false }));
		},
		clear(): void {
			initialized = true;
			set({ user: null, loading: false });
		},
	};
}

export const blogAuth: ReturnType<typeof createAuthStore> = createAuthStore();
