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

	return {
		subscribe,
		async refresh(): Promise<void> {
			try {
				const { user } = await authApi.getSession();
				set({ user, loading: false });
			} catch {
				set({ user: null, loading: false });
			}
		},
		setUser(user: BlogUser): void {
			update((state) => ({ ...state, user, loading: false }));
		},
		clear(): void {
			set({ user: null, loading: false });
		},
	};
}

export const blogAuth: ReturnType<typeof createAuthStore> = createAuthStore();
