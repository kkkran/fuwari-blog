<script lang="ts">
	import { onMount } from "svelte";
	import Icon from "@components/IconSvelte.svelte";
	import { blogAuth } from "@/blog/stores/auth";
	import { authApi, notificationApi } from "@/blog/api";
	import { emitErrorToast, emitSuccessToast } from "@/forum/utils/toast";

	let menuOpen = false;
	let unread = 0;
	let loginUrl = "/auth/login/";

	$: user = $blogAuth.user;
	$: loading = $blogAuth.loading;

	function buildLoginUrl(): void {
		const redirect = encodeURIComponent(
			window.location.pathname + window.location.search,
		);
		loginUrl = `/auth/login/?redirect=${redirect}`;
	}

	async function refreshUnread(): Promise<void> {
		try {
			const { count } = await notificationApi.unreadCount();
			unread = count;
		} catch {
			unread = 0;
		}
	}

	function toggleMenu(): void {
		menuOpen = !menuOpen;
	}

	async function handleManageClick(event: MouseEvent): Promise<void> {
		// 点击「我的文章」时先标记全部通知已读（红点消失），再跳转；
		// 避免整页导航中断进行中的已读请求。
		event.preventDefault();
		const target = event.currentTarget as HTMLAnchorElement | null;
		const href = target?.href ?? "/blog/manage/";
		try {
			await notificationApi.markRead();
			unread = 0;
		} catch {
			// 标记失败不阻塞导航；红点保留，待下次轮询或点击重试
		}
		window.location.href = href;
	}

	function handleDocClick(event: MouseEvent): void {
		const target = event.target as HTMLElement | null;
		if (target && target.closest("[data-authnav]")) return;
		menuOpen = false;
	}

	async function logout(): Promise<void> {
		try {
			await authApi.logout();
			blogAuth.clear();
			emitSuccessToast("退出登录", "已安全退出");
			window.location.reload();
		} catch (error) {
			emitErrorToast(
				"退出登录",
				error instanceof Error ? error.message : "退出失败，请稍后再试",
			);
		}
	}

	onMount(() => {
		buildLoginUrl();
		blogAuth.refresh();
		refreshUnread();
		const timer = setInterval(refreshUnread, 60_000);
		document.addEventListener("click", handleDocClick);
		return () => {
			clearInterval(timer);
			document.removeEventListener("click", handleDocClick);
		};
	});
</script>

<div data-authnav class="flex shrink-0 items-center gap-1.5">
	{#if loading && !user}
		<div class="h-8 w-8 animate-pulse rounded-full bg-[var(--foreground)]/10"></div>
	{:else if !user}
		<a
			href={loginUrl}
			class="inline-flex items-center gap-1 rounded-md border border-[var(--foreground)]/30 px-3 py-1.5 text-sm text-[var(--muted-foreground)] transition-colors hover:border-[var(--foreground)] hover:text-[var(--foreground)]"
		>
			<Icon icon="material-symbols:login-rounded" class="size-4" />
			<span>登录</span>
		</a>
	{:else}
		<a
			href="/blog/new/"
			title="写文章"
			aria-label="写文章"
			class="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--foreground)] hover:text-[var(--background)]"
		>
			<Icon icon="material-symbols:add-rounded" class="text-[1.35rem]" />
		</a>
		<div class="relative">
			<button
				type="button"
				aria-label="用户菜单"
				on:click={toggleMenu}
				class="relative block h-8 w-8 cursor-pointer rounded-full outline-none transition-opacity hover:opacity-80"
			>
				<img
					src={user.avatarUrl || "/seo-cover-64.webp"}
					alt={user.displayName}
					width="32"
					height="32"
					class="h-8 w-8 rounded-full object-cover"
				/>
				{#if unread > 0}
					<span
						class="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white"
						>{unread}</span
					>
				{/if}
			</button>

			{#if menuOpen}
				<div
					class="absolute right-0 top-full z-50 mt-2 w-56 border border-[var(--foreground)]/30 bg-[var(--popover)] p-1 text-[var(--popover-foreground)] shadow-lg"
				>
					<div
						class="flex items-center gap-2 border-b border-[var(--foreground)]/10 px-2 py-2"
					>
						<img
							src={user.avatarUrl || "/seo-cover-64.webp"}
							alt=""
							width="28"
							height="28"
							class="h-7 w-7 rounded-full object-cover"
						/>
						<div class="min-w-0">
							<p class="truncate text-sm font-semibold">{user.displayName}</p>
							<p class="truncate text-xs text-[var(--muted-foreground)]">
								{user.role === "admin" ? "管理员" : "用户"}
							</p>
						</div>
					</div>

					<a
						href="/blog/new/"
						class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-[var(--foreground)] hover:text-[var(--background)]"
					>
						<Icon icon="material-symbols:edit-rounded" class="size-4" />
						<span>写文章</span>
					</a>
					<a
						href="/blog/manage/"
						on:click={handleManageClick}
						class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-[var(--foreground)] hover:text-[var(--background)]"
					>
						<Icon icon="material-symbols:article-rounded" class="size-4" />
						<span>我的文章</span>
						{#if unread > 0}
							<span class="ml-auto rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white"
								>{unread}</span
							>
						{/if}
					</a>
					{#if user.role === "admin"}
						<a
							href="/blog/admin/"
							class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-[var(--foreground)] hover:text-[var(--background)]"
						>
							<Icon icon="material-symbols:fact-check-rounded" class="size-4" />
							<span>审核管理</span>
						</a>
					{/if}

					<button
						type="button"
						on:click={logout}
						class="mt-1 flex w-full cursor-pointer items-center gap-2 rounded-sm border-t border-[var(--foreground)]/10 px-2 py-1.5 text-left text-sm text-red-400 outline-none transition-colors hover:bg-red-500/10"
					>
						<Icon icon="material-symbols:logout-rounded" class="size-4" />
						<span>退出登录</span>
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>
