<script lang="ts">
	import { onMount } from "svelte";
	import { get } from "svelte/store";
	import { notificationApi, type BlogNotification } from "@/blog/api";
	import { blogAuth } from "@/blog/stores/auth";
	import Icon from "@components/IconSvelte.svelte";

	/** 公告配置（由 Layout SSR 注入） */
	export let announcement: { enable: boolean; text: string; version: number };
	export let pollIntervalMs = 60000;

	const LS_PREFIX = "announcement-seen-v";

	let announcementVisible = false;
	let notifications: BlogNotification[] = [];
	let showNotifyModal = false;
	let lastUnreadCount = 0;
	let newCountToast = 0;

	function formatTime(ts: string): string {
		const date = new Date(ts.replace(" ", "T") + "Z");
		if (Number.isNaN(date.getTime())) return ts;
		return date.toLocaleString("zh-CN", {
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		});
	}

	function typeIcon(type: string): string {
		if (type === "review_result") return "material-symbols:fact-check-rounded";
		return "material-symbols:notifications-rounded";
	}

	async function loadNotifications(): Promise<void> {
		try {
			const { items } = await notificationApi.list();
			notifications = items;
		} catch {
			notifications = [];
		}
	}

	async function checkUnread(): Promise<void> {
		if (!get(blogAuth).user) return;
		try {
			const { count } = await notificationApi.unreadCount();
			if (count > lastUnreadCount && lastUnreadCount >= 0) {
				// 轮询期间新增：右下角提示
				newCountToast = count - lastUnreadCount;
				setTimeout(() => {
					newCountToast = 0;
				}, 8000);
			}
			lastUnreadCount = count;
			// 首屏：有未读则弹窗
			if (count > 0 && notifications.length === 0) {
				await loadNotifications();
				showNotifyModal = true;
			}
		} catch {
			// 网络异常静默
		}
	}

	async function openNotifyModal(): Promise<void> {
		await loadNotifications();
		showNotifyModal = true;
		newCountToast = 0;
	}

	async function markAllRead(): Promise<void> {
		try {
			await notificationApi.markRead();
			lastUnreadCount = 0;
			notifications = notifications.map((n) => ({ ...n, read: true }));
		} catch {
			// 静默
		}
	}

	function closeModal(): void {
		showNotifyModal = false;
		void markAllRead();
	}

	function dismissAnnouncement(): void {
		announcementVisible = false;
		try {
			localStorage.setItem(`${LS_PREFIX}${announcement.version}`, "1");
		} catch {
			// 存储不可用忽略
		}
	}

	onMount(() => {
		// 公告：版本号去重
		if (announcement.enable && announcement.text) {
			try {
				if (!localStorage.getItem(`${LS_PREFIX}${announcement.version}`)) {
					announcementVisible = true;
				}
			} catch {
				announcementVisible = true;
			}
		}

		// 登录用户：首屏未读检查 + 定时轮询
		if (get(blogAuth).user) {
			void checkUnread();
			const timer = setInterval(() => void checkUnread(), pollIntervalMs);
			return () => clearInterval(timer);
		}
	});
</script>

<!-- 首屏未读通知弹窗 -->
{#if showNotifyModal}
	<div
		class="fixed inset-0 z-[99] flex items-center justify-center bg-black/60 p-4"
		role="dialog"
		aria-modal="true"
		on:click={closeModal}
	>
		<div
			class="max-h-[70vh] w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0f1218] shadow-2xl"
			on:click|stopPropagation
		>
			<div class="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
				<h2 class="text-sm font-bold">通知</h2>
				<button
					class="cursor-pointer text-xs text-white/50 transition-colors hover:text-white"
					on:click={closeModal}
					>关闭</button
				>
			</div>
			<div class="max-h-[50vh] overflow-y-auto">
				{#if notifications.length === 0}
					<p class="px-5 py-8 text-center text-sm text-white/40">暂无通知</p>
				{:else}
					<ul class="flex flex-col">
						{#each notifications as n (n.id)}
							<li
								class="flex items-start gap-3 border-b border-white/5 px-5 py-3"
								class:opacity-60={n.read}
							>
								<Icon
									icon={typeIcon(n.type)}
									class="mt-0.5 shrink-0 text-base text-[var(--primary)]"
								/>
								<div class="min-w-0">
									<p class="text-sm text-white/85">{n.message}</p>
									<p class="mt-0.5 text-xs text-white/35">{formatTime(n.createdAt)}</p>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
			<div class="border-t border-white/10 px-5 py-3">
				<button
					class="w-full cursor-pointer rounded-lg bg-white/5 py-2 text-xs font-medium text-white/70 transition-colors hover:bg-white/10"
					on:click={closeModal}
					>全部已读</button
				>
			</div>
		</div>
	</div>
{/if}

<!-- 右下角消息容器 -->
<div class="fixed bottom-4 right-4 z-[100] flex w-72 flex-col gap-2">
	{#if announcementVisible}
		<div class="flex items-start gap-3 rounded-xl border border-white/10 bg-[#0f1218] p-4 shadow-2xl">
			<Icon icon="material-symbols:campaign-rounded" class="mt-0.5 shrink-0 text-lg text-[var(--primary)]" />
			<p class="flex-1 text-sm leading-relaxed text-white/85">{announcement.text}</p>
			<button
				class="cursor-pointer text-white/40 transition-colors hover:text-white"
				aria-label="关闭公告"
				on:click={dismissAnnouncement}
			>
				<Icon icon="material-symbols:close-rounded" class="text-base" />
			</button>
		</div>
	{/if}

	{#if newCountToast > 0}
		<button
			class="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-[#0f1218] px-4 py-3 text-left shadow-2xl transition-colors hover:bg-[#151a22]"
			on:click={() => void openNotifyModal()}
		>
			<Icon icon="material-symbols:notifications-active-rounded" class="text-lg text-[var(--primary)]" />
			<span class="flex-1 text-sm text-white/85">有 {newCountToast} 条新通知</span>
			<Icon icon="material-symbols:chevron-right-rounded" class="text-base text-white/40" />
		</button>
	{/if}
</div>
