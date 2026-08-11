<script lang="ts">
	import { onMount } from "svelte";
	import Icon from "@components/IconSvelte.svelte";
	import { authApi, BLOG_API_BASE } from "@/blog/api";
	import { blogAuth } from "@/blog/stores/auth";
	import { emitErrorToast, emitSuccessToast } from "@/forum/utils/toast";

	let email = "";
	let password = "";
	let loading = false;
	let githubEnabled = false;
	let redirect = "/";

	function safeRedirect(raw: string | null): string {
		if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
		return "/";
	}

	async function submit(): Promise<void> {
		if (!email || !password) {
			emitErrorToast("登录", "请输入邮箱和密码");
			return;
		}
		loading = true;
		try {
			const { user } = await authApi.login({ email, password });
			blogAuth.setUser(user);
			emitSuccessToast("登录", "登录成功，正在跳转...", true);
			window.location.href = redirect;
		} catch (error) {
			emitErrorToast(
				"登录",
				error instanceof Error ? error.message : "登录失败，请稍后再试",
			);
		} finally {
			loading = false;
		}
	}

	onMount(async () => {
		redirect = safeRedirect(new URLSearchParams(window.location.search).get("redirect"));
		try {
			const { github } = await authApi.getProviders();
			githubEnabled = github;
		} catch {
			githubEnabled = false;
		}
	});
</script>

<div class="card-base mx-auto mt-10 w-full max-w-md p-6 md:p-8">
	<div class="mb-6 text-center">
		<h1 class="text-xl font-bold">登录</h1>
		<p class="mt-1 text-sm text-white/55">登录后可发布博客文章</p>
	</div>

	{#if githubEnabled}
		<a
			href={`${BLOG_API_BASE}/api/auth/github?redirect=${encodeURIComponent(redirect)}`}
			class="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-white/10"
		>
			<svg viewBox="0 0 16 16" class="size-4 fill-current" aria-hidden="true">
				<path
					d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
				></path>
			</svg>
			<span>使用 GitHub 登录</span>
		</a>

		<div class="my-5 flex items-center gap-3 text-xs text-white/40">
			<div class="h-px flex-1 bg-white/10"></div>
			<span>或使用邮箱</span>
			<div class="h-px flex-1 bg-white/10"></div>
		</div>
	{/if}

	<div class="flex flex-col gap-3">
		<input
			bind:value={email}
			type="email"
			autocomplete="email"
			placeholder="邮箱"
			class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-[var(--primary)]"
		/>
		<input
			bind:value={password}
			type="password"
			autocomplete="current-password"
			placeholder="密码"
			on:keydown={(event) => {
				if (event.key === "Enter") submit();
			}}
			class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-[var(--primary)]"
		/>
		<button
			class="mt-1 flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-2.5 font-bold text-black/80 transition-opacity disabled:opacity-60"
			disabled={loading}
			on:click={submit}
		>
			{#if loading}
				<Icon name="svg-spinners:ring-resize" class="size-4" />
			{/if}
			登录
		</button>
	</div>

	<div class="mt-4 flex items-center justify-center gap-4 text-sm">
		<a href={`/auth/register/?redirect=${encodeURIComponent(redirect)}`} class="text-[var(--primary)]">
			没有账号？注册
		</a>
	</div>
</div>
