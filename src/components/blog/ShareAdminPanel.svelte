<script lang="ts">
	import { onMount } from "svelte";
	import { shareAdminApi } from "@/blog/api";
	import { emitErrorToast, emitSuccessToast } from "@/forum/utils/toast";
	import Skeleton from "@/components/misc/Skeleton.svelte";
	import Icon from "@components/IconSvelte.svelte";

	interface PendingShare {
		id: string;
		email: string;
		filename: string;
		status: string;
		size: number;
		createdAt: string;
	}

	let items: PendingShare[] = [];
	let loading = true;
	let previewId: string | null = null;
	let previewText = "";
	let previewLoading = false;
	let operatingId: string | null = null;

	function formatSize(n: number): string {
		if (n < 1024) return `${n} B`;
		return `${(n / 1024).toFixed(1)} KB`;
	}

	async function loadPending(): Promise<void> {
		loading = true;
		try {
			const { files } = await shareAdminApi.pending();
			items = files;
		} catch (error) {
			emitErrorToast(
				"加载失败",
				error instanceof Error ? error.message : "待审列表加载失败",
			);
		} finally {
			loading = false;
		}
	}

	async function togglePreview(id: string): Promise<void> {
		if (previewId === id) {
			previewId = null;
			return;
		}
		previewId = id;
		previewText = "";
		previewLoading = true;
		try {
			previewText = await shareAdminApi.content(id);
		} catch (error) {
			emitErrorToast(
				"预览失败",
				error instanceof Error ? error.message : "内容读取失败",
			);
			previewId = null;
		} finally {
			previewLoading = false;
		}
	}

	async function approve(id: string, filename: string): Promise<void> {
		if (!window.confirm(`确定通过《${filename}》吗？通过后链接立即可公开访问。`)) return;
		operatingId = id;
		try {
			await shareAdminApi.approve(id);
			emitSuccessToast("已通过", `《${filename}》已公开`);
			await loadPending();
		} catch (error) {
			emitErrorToast(
				"操作失败",
				error instanceof Error ? error.message : "审核操作失败",
			);
		} finally {
			operatingId = null;
		}
	}

	async function reject(id: string, filename: string): Promise<void> {
		if (!window.confirm(`确定拒绝《${filename}》吗？文件将被删除。`)) return;
		operatingId = id;
		try {
			await shareAdminApi.reject(id);
			emitSuccessToast("已拒绝", `《${filename}》已删除`);
			if (previewId === id) previewId = null;
			await loadPending();
		} catch (error) {
			emitErrorToast(
				"操作失败",
				error instanceof Error ? error.message : "审核操作失败",
			);
		} finally {
			operatingId = null;
		}
	}

	onMount(() => {
		void loadPending();
	});
</script>

<div>
	<div class="mb-3 flex items-center justify-between">
		<h2 class="text-sm font-bold text-white/80">分享文件审核</h2>
		<span class="text-xs text-white/40">超限上传的 txt 文件等待审核</span>
	</div>

	{#if loading}
		<div class="rounded-xl border border-white/10 bg-white/5 p-4">
			<Skeleton rows={3} widths={["100%", "85%", "70%"]} gap="1rem" />
		</div>
	{:else if items.length === 0}
		<div class="flex flex-col items-center gap-3 py-12 text-center">
			<Icon icon="material-symbols:task-alt-rounded" class="size-10 text-white/25" />
			<p class="text-sm text-white/45">暂无待审核文件</p>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each items as item (item.id)}
				<div class="rounded-xl border border-white/10 bg-white/5 p-4">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<h3 class="truncate text-sm font-semibold text-white/85" title={item.filename}>
								{item.filename}
							</h3>
							<p class="mt-1 text-xs text-white/40">
								{item.email} · {formatSize(item.size)} · {item.createdAt}
							</p>
						</div>
						<div class="flex shrink-0 items-center gap-2">
							<button
								class="cursor-pointer rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/60 transition-colors hover:bg-white/10"
								on:click={() => togglePreview(item.id)}
								>预览</button
							>
							<button
								class="cursor-pointer rounded-lg bg-green-500/90 px-2.5 py-1 text-xs font-bold text-black transition-opacity hover:opacity-85 disabled:opacity-50"
								disabled={operatingId === item.id}
								on:click={() => approve(item.id, item.filename)}
							>
								{#if operatingId === item.id}
									<Icon icon="svg-spinners:ring-resize" class="mr-1 size-3 align-[-2px]" />
								{/if}
								通过
							</button>
							<button
								class="cursor-pointer rounded-lg bg-red-500/85 px-2.5 py-1 text-xs font-bold text-white transition-opacity hover:opacity-85 disabled:opacity-50"
								disabled={operatingId === item.id}
								on:click={() => reject(item.id, item.filename)}
							>
								拒绝
							</button>
						</div>
					</div>

					{#if previewId === item.id}
						<div class="mt-3">
							{#if previewLoading}
								<div class="rounded-lg border border-white/10 bg-black/20 p-3">
									<Skeleton rows={3} widths={["100%", "90%", "80%"]} gap="0.6rem" />
								</div>
							{:else}
								<pre
									class="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-white/10 bg-black/20 p-3 text-xs leading-relaxed text-white/70"
								>{previewText}</pre>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>