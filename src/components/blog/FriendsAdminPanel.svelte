<script lang="ts">
	import { onMount } from "svelte";
	import {
		friendsAdminApi,
		friendsApi,
		type FriendEntry,
		type FriendPendingItem,
	} from "@/blog/api";
	import { emitErrorToast, emitSuccessToast } from "@/forum/utils/toast";
	import Skeleton from "@/components/misc/Skeleton.svelte";
	import Icon from "@components/IconSvelte.svelte";

	let loading = true;
	let pendingItems: FriendPendingItem[] = [];
	let approvedItems: FriendEntry[] = [];
	let activeTab: "pending" | "approved" = "pending";
	let busyId: number | null = null;

	async function loadAll(): Promise<void> {
		loading = true;
		try {
			const [pendingRes, listRes] = await Promise.all([
				friendsAdminApi.pending(),
				friendsApi.list(),
			]);
			pendingItems = pendingRes.items;
			approvedItems = listRes.friends;
		} catch (error) {
			emitErrorToast(
				"加载失败",
				error instanceof Error ? error.message : "友链数据加载失败",
			);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadAll();
	});

	function formatTime(ts: string): string {
		return ts.slice(0, 16).replace("T", " ");
	}

	async function approve(id: number, siteName: string): Promise<void> {
		if (!window.confirm(`确定通过「${siteName}」的友链申请吗？`)) return;
		busyId = id;
		try {
			await friendsAdminApi.approve(id);
			emitSuccessToast("已通过", `「${siteName}」已加入友链`);
			await loadAll();
		} catch (error) {
			emitErrorToast(
				"操作失败",
				error instanceof Error ? error.message : "审核操作失败",
			);
		} finally {
			busyId = null;
		}
	}

	async function reject(id: number, siteName: string): Promise<void> {
		if (!window.confirm(`确定拒绝「${siteName}」的申请吗？`)) return;
		busyId = id;
		try {
			await friendsAdminApi.reject(id);
			emitSuccessToast("已拒绝", `「${siteName}」的申请已拒绝`);
			await loadAll();
		} catch (error) {
			emitErrorToast(
				"操作失败",
				error instanceof Error ? error.message : "审核操作失败",
			);
		} finally {
			busyId = null;
		}
	}

	async function remove(id: number, siteName: string): Promise<void> {
		if (!window.confirm(`确定移除「${siteName}」吗？`)) return;
		busyId = id;
		try {
			await friendsAdminApi.remove(id);
			emitSuccessToast("已移除", `「${siteName}」已从友链移除`);
			await loadAll();
		} catch (error) {
			emitErrorToast(
				"操作失败",
				error instanceof Error ? error.message : "操作失败",
			);
		} finally {
			busyId = null;
		}
	}
</script>

<div>
	<div class="mb-4 flex gap-2">
		<button
			class="cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold transition-colors {activeTab === 'pending'
				? 'bg-[var(--primary)] text-black/80'
				: 'border border-white/15 text-white/60 hover:bg-white/10'}"
			on:click={() => (activeTab = "pending")}
		>
			待审核 ({pendingItems.length})
		</button>
		<button
			class="cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold transition-colors {activeTab === 'approved'
				? 'bg-[var(--primary)] text-black/80'
				: 'border border-white/15 text-white/60 hover:bg-white/10'}"
			on:click={() => (activeTab = "approved")}
		>
			已通过 ({approvedItems.length})
		</button>
	</div>

	{#if loading}
		<Skeleton rows={4} widths={["100%", "85%", "72%", "92%"]} gap="1rem" />
	{:else if activeTab === "pending"}
		{#if pendingItems.length === 0}
			<div class="flex flex-col items-center gap-3 py-16 text-center">
				<Icon icon="material-symbols:task-alt-rounded" class="size-10 text-white/30" />
				<p class="text-white/60">暂无待审核的友链申请</p>
			</div>
		{:else}
			<div class="flex flex-col gap-3">
				{#each pendingItems as item (item.id)}
					<div class="rounded-xl border border-white/10 bg-white/5 p-4">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<h3 class="truncate text-base font-semibold">{item.siteName}</h3>
								<!-- 站点链接：可直接点击跳转查看 -->
								<a
									href={item.url}
									target="_blank"
									rel="noopener noreferrer"
									class="mt-1 inline-flex max-w-full items-center gap-1 truncate text-sm text-[var(--primary)] hover:underline"
								>
									<Icon icon="material-symbols:open-in-new-rounded" class="size-3.5 shrink-0" />
									<span class="truncate">{item.url}</span>
								</a>
								{#if item.description}
									<p class="mt-1 line-clamp-2 text-xs text-white/40">{item.description}</p>
								{/if}
								<p class="mt-2 text-xs text-white/35">
									申请者：{item.email ?? "未知"} · IP: {item.sourceIp} · {formatTime(item.createdAt)}
								</p>
							</div>
							<div class="flex shrink-0 flex-col gap-2">
								<button
									class="cursor-pointer rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-black/80 transition-opacity disabled:opacity-60"
									disabled={busyId === item.id}
									on:click={() => approve(item.id, item.siteName)}
									>通过</button
								>
								<button
									class="cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/10 disabled:opacity-60"
									disabled={busyId === item.id}
									on:click={() => reject(item.id, item.siteName)}
									>拒绝</button
								>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{:else}
		{#if approvedItems.length === 0}
			<div class="flex flex-col items-center gap-3 py-16 text-center">
				<Icon icon="material-symbols:link-rounded" class="size-10 text-white/30" />
				<p class="text-white/60">还没有已通过的友链</p>
			</div>
		{:else}
			<div class="flex flex-col gap-3">
				{#each approvedItems as item (item.id)}
					<div class="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
						<div class="min-w-0">
							<h3 class="truncate text-base font-semibold">{item.siteName}</h3>
							<a
								href={item.url}
								target="_blank"
								rel="noopener noreferrer"
								class="mt-1 inline-flex max-w-full items-center gap-1 truncate text-sm text-[var(--primary)] hover:underline"
							>
								<Icon icon="material-symbols:open-in-new-rounded" class="size-3.5 shrink-0" />
								<span class="truncate">{item.url}</span>
							</a>
						</div>
						<button
							class="cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/10 disabled:opacity-60"
							disabled={busyId === item.id}
							on:click={() => remove(item.id, item.siteName)}
							>移除</button
						>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
