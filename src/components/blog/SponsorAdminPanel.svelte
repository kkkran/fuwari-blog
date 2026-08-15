<script lang="ts">
	import { onMount } from "svelte";
	import { sponsorsApi, sponsorsAdminApi, type SponsorEntry, type SponsorPendingItem } from "@/blog/api";
	import { emitErrorToast, emitSuccessToast } from "@/forum/utils/toast";
	import Skeleton from "@/components/misc/Skeleton.svelte";
	import Icon from "@components/IconSvelte.svelte";

	type PanelTab = "pending" | "approved";

	let activeTab: PanelTab = "pending";
	let pendingItems: SponsorPendingItem[] = [];
	let approvedItems: SponsorEntry[] = [];
	let loading = true;
	let busyId: number | null = null;

	// 编辑态：key = 记录 id
	let editing: Record<number, boolean> = {};
	let editName: Record<number, string> = {};
	let editAmount: Record<number, string> = {};
	let editAnonymous: Record<number, boolean> = {};

	async function loadAll(): Promise<void> {
		loading = true;
		try {
			const [pendingRes, listRes] = await Promise.all([
				sponsorsAdminApi.pending(),
				sponsorsApi.list(),
			]);
			pendingItems = pendingRes.items;
			approvedItems = listRes.sponsors;
		} catch (error) {
			emitErrorToast(
				"加载失败",
				error instanceof Error ? error.message : "赞助列表加载失败",
			);
		} finally {
			loading = false;
		}
	}

	function switchTab(tab: PanelTab): void {
		activeTab = tab;
	}

	async function approve(id: number, name: string): Promise<void> {
		if (!window.confirm(`确定通过 ${name} 的赞助登记吗？`)) return;
		busyId = id;
		try {
			await sponsorsAdminApi.approve(id);
			emitSuccessToast("已通过", `${name} 已加入赞助名单`);
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

	async function reject(id: number, name: string): Promise<void> {
		if (!window.confirm(`确定拒绝 ${name} 的赞助登记吗？`)) return;
		busyId = id;
		try {
			await sponsorsAdminApi.reject(id);
			emitSuccessToast("已拒绝", `${name} 的登记已拒绝`);
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

	function startEdit(item: SponsorEntry): void {
		editing[item.id] = true;
		editName[item.id] = item.displayName;
		editAmount[item.id] = String(item.amount);
		editAnonymous[item.id] = item.anonymous;
		editing = editing;
	}

	function cancelEdit(id: number): void {
		editing[id] = false;
		editing = editing;
	}

	async function saveEdit(id: number): Promise<void> {
		const amount = Number(editAmount[id]);
		if (Number.isNaN(amount) || amount <= 0) {
			emitErrorToast("保存失败", "请输入正确的金额");
			return;
		}
		busyId = id;
		try {
			await sponsorsAdminApi.update(id, {
				displayName: editName[id].trim() || undefined,
				amount,
				anonymous: editAnonymous[id],
			});
			emitSuccessToast("已保存", "名单记录已更新");
			editing[id] = false;
			editing = editing;
			await loadAll();
		} catch (error) {
			emitErrorToast(
				"保存失败",
				error instanceof Error ? error.message : "更新失败",
			);
		} finally {
			busyId = null;
		}
	}

	async function remove(id: number, name: string): Promise<void> {
		if (!window.confirm(`确定删除 ${name} 这条记录吗？此操作不可恢复。`)) return;
		busyId = id;
		try {
			await sponsorsAdminApi.remove(id);
			emitSuccessToast("已删除", "记录已删除");
			await loadAll();
		} catch (error) {
			emitErrorToast(
				"操作失败",
				error instanceof Error ? error.message : "删除失败",
			);
		} finally {
			busyId = null;
		}
	}

	onMount(() => {
		void loadAll();
	});
</script>

<div class="mt-6">
	<div class="mb-4 flex gap-2">
		<button
			class="cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold transition-colors {activeTab ===
			'pending'
				? 'bg-[var(--primary)] text-black/80'
				: 'border border-white/15 text-white/60 hover:bg-white/10'}"
			on:click={() => switchTab("pending")}
		>
			待审核 ({pendingItems.length})
		</button>
		<button
			class="cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold transition-colors {activeTab ===
			'approved'
				? 'bg-[var(--primary)] text-black/80'
				: 'border border-white/15 text-white/60 hover:bg-white/10'}"
			on:click={() => switchTab("approved")}
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
				<p class="text-white/60">暂无待审核的赞助登记</p>
			</div>
		{:else}
			<div class="flex flex-col gap-3">
				{#each pendingItems as item (item.id)}
					<div class="rounded-xl border border-white/10 bg-white/5 p-4">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<h2 class="truncate text-base font-semibold">
									{item.displayName}
									{#if item.anonymous}
										<span class="ml-1 rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-300">匿名</span>
									{/if}
								</h2>
								<p class="mt-1 text-xs text-white/40">
									金额：¥{item.amount}
									{item.remark ? ` · 备注：${item.remark}` : ""}
								</p>
								<p class="mt-0.5 text-xs text-white/30">
									账号：{item.email ?? "无"} · IP：{item.sourceIp} · 提交于 {item.createdAt}
								</p>
							</div>
							<div class="flex shrink-0 items-center gap-2">
								<button
									class="cursor-pointer rounded-lg bg-green-500/90 px-2.5 py-1 text-xs font-bold text-black transition-opacity hover:opacity-85 disabled:opacity-50"
									disabled={busyId === item.id}
									on:click={() => approve(item.id, item.displayName)}
								>
									通过
								</button>
								<button
									class="cursor-pointer rounded-lg border border-red-500/40 px-2.5 py-1 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
									disabled={busyId === item.id}
									on:click={() => reject(item.id, item.displayName)}
								>
									拒绝
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{:else}
		{#if approvedItems.length === 0}
			<div class="flex flex-col items-center gap-3 py-16 text-center">
				<Icon icon="material-symbols:group-rounded" class="size-10 text-white/30" />
				<p class="text-white/60">暂无已通过的赞助记录</p>
			</div>
		{:else}
			<div class="flex flex-col gap-3">
				{#each approvedItems as item (item.id)}
					<div class="rounded-xl border border-white/10 bg-white/5 p-4">
						{#if editing[item.id]}
							<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
								<label class="block">
									<span class="mb-1 block text-xs text-white/40">昵称</span>
									<input
										bind:value={editName[item.id]}
										type="text"
										maxlength="24"
										class="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/30"
									/>
								</label>
								<label class="block">
									<span class="mb-1 block text-xs text-white/40">金额（¥）</span>
									<input
										bind:value={editAmount[item.id]}
										type="number"
										min="0.01"
										step="0.01"
										class="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/30"
									/>
								</label>
								<label class="flex items-end gap-2 pb-2">
									<input
										bind:checked={editAnonymous[item.id]}
										type="checkbox"
										class="h-4 w-4 accent-[var(--primary)]"
									/>
									<span class="text-xs text-white/60">匿名</span>
								</label>
							</div>
							<div class="mt-3 flex items-center gap-2">
								<button
									class="cursor-pointer rounded-lg bg-green-500/90 px-3 py-1.5 text-xs font-bold text-black transition-opacity hover:opacity-85 disabled:opacity-50"
									disabled={busyId === item.id}
									on:click={() => saveEdit(item.id)}
								>
									保存
								</button>
								<button
									class="cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/10"
									on:click={() => cancelEdit(item.id)}
								>
									取消
								</button>
							</div>
						{:else}
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0">
									<h2 class="truncate text-base font-semibold">
										{item.displayName}
										{#if item.anonymous}
											<span class="ml-1 rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-300">匿名</span>
										{/if}
									</h2>
									<p class="mt-1 text-xs text-white/40">
										金额：{item.amountText} · 日期：{item.date}
									</p>
								</div>
								<div class="flex shrink-0 items-center gap-2">
									<button
										class="cursor-pointer rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/60 transition-colors hover:bg-white/10"
										on:click={() => startEdit(item)}
									>
										修改
									</button>
									<button
										class="cursor-pointer rounded-lg border border-red-500/40 px-2.5 py-1 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
										disabled={busyId === item.id}
										on:click={() => remove(item.id, item.displayName)}
									>
										删除
									</button>
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
