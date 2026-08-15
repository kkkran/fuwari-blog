<script lang="ts">
	import { onMount } from "svelte";
	import { blogApi, type BlogPost, type PostStatus } from "@/blog/api";
	import { blogAuth } from "@/blog/stores/auth";
	import { emitErrorToast, emitSuccessToast } from "@/forum/utils/toast";
	import Skeleton from "@/components/misc/Skeleton.svelte";
	import Icon from "@components/IconSvelte.svelte";
	import SponsorAdminPanel from "./SponsorAdminPanel.svelte";

	let adminMode: "posts" | "sponsors" = "posts";

	let activeStatus: PostStatus = "pending";
	let items: BlogPost[] = [];
	let loading = true;
	let expandedSlug: string | null = null;
	let rejectReason: Record<string, string> = {};
	let rejectingSlug: string | null = null;
	let approvingSlug: string | null = null;

	$: user = $blogAuth.user;
	$: isAdmin = user?.role === "admin";
	$: tabLabel =
		activeStatus === "pending" ? "待审核" : activeStatus === "approved" ? "已公开" : "已拒绝";

	const tabs: { key: PostStatus; label: string }[] = [
		{ key: "pending", label: "待审核" },
		{ key: "approved", label: "已公开" },
		{ key: "rejected", label: "已拒绝" },
	];

	async function loadList(): Promise<void> {
		loading = true;
		try {
			const { items: list } = await blogApi.listByStatus(activeStatus);
			items = list;
		} catch (error) {
			emitErrorToast(
				"加载失败",
				error instanceof Error ? error.message : "审核列表加载失败",
			);
		} finally {
			loading = false;
		}
	}

	function switchTab(status: PostStatus): void {
		activeStatus = status;
		void loadList();
	}

	function toggleExpand(slug: string): void {
		expandedSlug = expandedSlug === slug ? null : slug;
	}

	async function approve(slug: string, title: string): Promise<void> {
		if (!window.confirm(`确定通过《${title}》并公开吗？`)) return;
		approvingSlug = slug;
		try {
			await blogApi.approve(slug);
			emitSuccessToast("已通过", "《" + title + "》已公开");
			await loadList();
		} catch (error) {
			emitErrorToast(
				"操作失败",
				error instanceof Error ? error.message : "审核操作失败",
			);
		} finally {
			approvingSlug = null;
		}
	}

	async function reject(slug: string, title: string): Promise<void> {
		const reason = (rejectReason[slug] ?? "").trim();
		if (!reason) {
			emitErrorToast("拒绝失败", "请填写拒绝原因");
			return;
		}
		if (!window.confirm(`确定拒绝《${title}》吗？`)) return;
		rejectingSlug = slug;
		try {
			await blogApi.reject(slug, reason);
			emitSuccessToast("已拒绝", "《" + title + "》已退回作者");
			await loadList();
		} catch (error) {
			emitErrorToast(
				"操作失败",
				error instanceof Error ? error.message : "审核操作失败",
			);
		} finally {
			rejectingSlug = null;
		}
	}

	onMount(async () => {
		await blogAuth.refresh();
		if ($blogAuth.user?.role === "admin") {
			await loadList();
		}
	});
</script>

<div class="card-base mx-auto w-full max-w-3xl p-6 md:p-8">
	<div class="mb-6 border-b border-white/10 pb-6">
		<h1 class="text-xl font-bold">审核管理</h1>
		<p class="mt-1 text-sm text-white/55">审核通过的文章会立即公开，拒绝需填写原因</p>
	</div>

	<div class="mb-4 flex gap-2">
		<button
			class="cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold transition-colors {adminMode ===
			'posts'
				? 'bg-[var(--primary)] text-black/80'
				: 'border border-white/15 text-white/60 hover:bg-white/10'}"
			on:click={() => (adminMode = "posts")}
		>
			文章审核
		</button>
		<button
			class="cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold transition-colors {adminMode ===
			'sponsors'
				? 'bg-[var(--primary)] text-black/80'
				: 'border border-white/15 text-white/60 hover:bg-white/10'}"
			on:click={() => (adminMode = "sponsors")}
		>
			赞助审核
		</button>
	</div>

	{#if !isAdmin}
		<div class="flex flex-col items-center gap-4 py-16 text-center">
			<Icon icon="material-symbols:lock-rounded" class="size-10 text-white/30" />
			<p class="text-white/60">此页面仅管理员可访问</p>
			{#if !user}
				<a
					href="/auth/login/?redirect=/blog/admin/"
					class="rounded-xl bg-[var(--primary)] px-5 py-2.5 font-bold text-black/80"
					>去登录</a
				>
			{/if}
		</div>
	{:else if adminMode === "posts"}
		<div class="mb-4 flex gap-2">
			{#each tabs as tab (tab.key)}
				<button
					class="cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold transition-colors {activeStatus === tab.key
						? 'bg-[var(--primary)] text-black/80'
						: 'border border-white/15 text-white/60 hover:bg-white/10'}"
					on:click={() => switchTab(tab.key)}
				>
					{tab.label}
				</button>
			{/each}
		</div>

		{#if loading}
			<Skeleton rows={4} widths={["100%", "85%", "72%", "92%"]} gap="1rem" />
		{:else if items.length === 0}
			<div class="flex flex-col items-center gap-3 py-16 text-center">
				<Icon icon="material-symbols:task-alt-rounded" class="size-10 text-white/30" />
				<p class="text-white/60">暂无{tabLabel}文章</p>
			</div>
		{:else}
			<div class="flex flex-col gap-3">
				{#each items as post (post.id)}
					<div class="rounded-xl border border-white/10 bg-white/5 p-4">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<h2 class="truncate text-base font-semibold">{post.title}</h2>
								<p class="mt-1 text-xs text-white/40">
									作者：{post.authorName} · 更新于 {post.updatedAt} · slug: {post.slug}
								</p>
							</div>
							<div class="flex shrink-0 items-center gap-2">
								<button
									class="cursor-pointer rounded-lg border border-white/15 px-2.5 py-1 text-xs transition-colors hover:bg-white/10"
									on:click={() => toggleExpand(post.slug)}
									aria-label="展开正文"
								>
									<Icon
										icon="material-symbols:keyboard-arrow-down-rounded"
										class="size-4 transition-transform {expandedSlug === post.slug ? 'rotate-180' : ''}"
									/>
								</button>
								{#if activeStatus === "pending"}
									<button
										class="cursor-pointer rounded-lg bg-green-500/90 px-2.5 py-1 text-xs font-bold text-black transition-opacity hover:opacity-85 disabled:opacity-50"
										disabled={approvingSlug === post.slug}
										on:click={() => approve(post.slug, post.title)}
									>
										{#if approvingSlug === post.slug}
											<Icon icon="svg-spinners:ring-resize" class="mr-1 size-3 align-[-2px]" />
										{/if}
										通过
									</button>
								{/if}
							</div>
						</div>

						{#if expandedSlug === post.slug}
							<div class="mt-3 border-t border-white/10 pt-3">
								{#if post.description}
									<p class="mb-2 text-sm text-white/55">摘要：{post.description}</p>
								{/if}
								{#if post.tags.length > 0}
									<div class="mb-2 flex flex-wrap gap-1.5">
										{#each post.tags as tag (tag)}
											<span class="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60"
												>#{tag}</span
											>
										{/each}
									</div>
								{/if}
								<pre
									class="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-3 text-xs leading-relaxed text-white/60"
									>{post.content}</pre
								>

								{#if activeStatus === "pending"}
									<div class="mt-3 flex items-center gap-2">
										<input
											bind:value={rejectReason[post.slug]}
											placeholder="拒绝原因（必填，将通知作者）"
											class="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-red-400"
										/>
										<button
											class="cursor-pointer rounded-lg border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
											disabled={rejectingSlug === post.slug}
											on:click={() => reject(post.slug, post.title)}
										>
											{#if rejectingSlug === post.slug}
												<Icon icon="svg-spinners:ring-resize" class="mr-1 size-3 align-[-2px]" />
											{/if}
											拒绝
										</button>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{:else}
		<SponsorAdminPanel />
	{/if}
</div>
