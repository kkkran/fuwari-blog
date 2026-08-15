<script lang="ts">
	import { onMount } from "svelte";
	import { get } from "svelte/store";
	import { blogApi, type BlogPost } from "@/blog/api";
	import { blogAuth } from "@/blog/stores/auth";
	import { emitErrorToast, emitSuccessToast } from "@/forum/utils/toast";
	import Skeleton from "@/components/misc/Skeleton.svelte";
	import Icon from "@components/IconSvelte.svelte";

	let items: BlogPost[] = [];
	let loading = true;
	let expandedSlug: string | null = null;

	$: user = $blogAuth.user;

	const statusMeta: Record<
		BlogPost["status"],
		{ label: string; className: string }
	> = {
		pending: {
			label: "待审核",
			className: "bg-yellow-500/15 text-yellow-400",
		},
		approved: {
			label: "已公开",
			className: "bg-green-500/15 text-green-400",
		},
		rejected: {
			label: "已拒绝",
			className: "bg-red-500/15 text-red-400",
		},
	};

	async function loadMine(): Promise<void> {
		loading = true;
		try {
			const { items: list } = await blogApi.mine();
			items = list;
		} catch (error) {
			emitErrorToast(
				"加载失败",
				error instanceof Error ? error.message : "文章列表加载失败",
			);
		} finally {
			loading = false;
		}
	}

	function toggleExpand(slug: string): void {
		expandedSlug = expandedSlug === slug ? null : slug;
	}

	async function removePost(slug: string, title: string): Promise<void> {
		if (!window.confirm(`确定撤回文章《${title}》吗？撤回后不可恢复。`)) return;
		try {
			await blogApi.remove(slug);
			emitSuccessToast("已撤回", "文章已删除");
			await loadMine();
		} catch (error) {
			emitErrorToast(
				"撤回失败",
				error instanceof Error ? error.message : "删除失败，请稍后再试",
			);
		}
	}

	onMount(async () => {
		await blogAuth.refresh();
		// 未登录时页面渲染登录引导，跳过注定 401 的列表请求
		if (get(blogAuth).user) {
			await loadMine();
		}
	});
</script>

<div class="card-base mx-auto w-full max-w-3xl p-6 md:p-8">
	<div class="mb-6 flex items-center justify-between gap-4 border-b border-white/10 pb-6">
		<div>
			<h1 class="text-xl font-bold">我的文章</h1>
			<p class="mt-1 text-sm text-white/55">共 {items.length} 篇 · 审核结果会在此显示</p>
		</div>
		<a
			href="/blog/new/"
			class="flex items-center gap-1.5 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-bold text-black/80"
		>
			<Icon icon="material-symbols:add-rounded" class="size-4" />
			写文章
		</a>
	</div>

	{#if !user}
		<div class="flex flex-col items-center gap-4 py-16 text-center">
			<p class="text-white/60">登录后查看和管理你的文章</p>
			<a
				href="/auth/login/?redirect=/blog/manage/"
				class="rounded-xl bg-[var(--primary)] px-5 py-2.5 font-bold text-black/80"
				>去登录</a
			>
		</div>
	{:else if loading}
		<Skeleton rows={4} widths={["100%", "85%", "72%", "92%"]} gap="1rem" />
	{:else if items.length === 0}
		<div class="flex flex-col items-center gap-4 py-16 text-center">
			<Icon icon="material-symbols:edit-note-rounded" class="size-10 text-white/30" />
			<p class="text-white/60">还没有文章，发布你的第一篇吧</p>
			<a
				href="/blog/new/"
				class="rounded-xl bg-[var(--primary)] px-5 py-2.5 font-bold text-black/80"
				>写文章</a
			>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each items as post (post.id)}
				<div class="rounded-xl border border-white/10 bg-white/5 p-4">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<div class="flex flex-wrap items-center gap-2">
								<h2 class="truncate text-base font-semibold">{post.title}</h2>
								<span
									class="rounded-full px-2 py-0.5 text-xs font-semibold {statusMeta[post.status].className}"
									>{statusMeta[post.status].label}</span
								>
							</div>
							<p class="mt-1 text-xs text-white/40">
								slug: {post.slug} · 更新于 {post.updatedAt}
							</p>
						</div>
						<div class="flex shrink-0 items-center gap-2">
							{#if post.status === "approved"}
								<a
									href={`/posts/${post.slug}/`}
									target="_blank"
									class="rounded-lg border border-white/15 px-2.5 py-1 text-xs transition-colors hover:bg-white/10"
									>查看</a
								>
							{/if}
							<a
								href={`/blog/new/?edit=${encodeURIComponent(post.slug)}`}
								class="rounded-lg border border-white/15 px-2.5 py-1 text-xs transition-colors hover:bg-white/10"
								>编辑</a
							>
							{#if post.status !== "approved"}
								<button
									class="cursor-pointer rounded-lg border border-red-500/30 px-2.5 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10"
									on:click={() => removePost(post.slug, post.title)}
									>撤回</button
								>
							{/if}
							<button
								class="cursor-pointer rounded-lg border border-white/15 px-2.5 py-1 text-xs transition-colors hover:bg-white/10"
								on:click={() => toggleExpand(post.slug)}
								aria-label="展开详情"
							>
								<Icon
									icon="material-symbols:keyboard-arrow-down-rounded"
									class="size-4 transition-transform {expandedSlug === post.slug ? 'rotate-180' : ''}"
								/>
							</button>
						</div>
					</div>

					{#if expandedSlug === post.slug}
						<div class="mt-3 border-t border-white/10 pt-3">
							{#if post.status === "rejected" && post.rejectReason}
								<div class="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm">
									<span class="font-semibold text-red-400">拒绝原因：</span>
									<span class="text-white/70">{post.rejectReason}</span>
								</div>
							{/if}
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
								class="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-3 text-xs leading-relaxed text-white/60"
								>{post.content}</pre
							>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
