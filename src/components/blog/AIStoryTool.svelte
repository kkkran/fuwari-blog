<script lang="ts">
	import { onMount } from "svelte";
	import { aiImageApi, aiStoryApi, type AiStoryListItem } from "@/blog/api";
	import { blogAuth } from "@/blog/stores/auth";
	import { emitErrorToast, emitSuccessToast } from "@/forum/utils/toast";
	import Icon from "@components/IconSvelte.svelte";

	const GENRES = ["科幻", "奇幻", "悬疑", "武侠", "都市", "惊悚"];

	let user = $blogAuth.user;
	let stories: AiStoryListItem[] = [];
	let loading = true;
	let creating = false;
	let continuing = false;
	let viewStoryId: number | null = null;
	let storyTitle = "";
	let storyGenre = "";
	let entries: { seq: number; content: string; choices: string[]; chosen: string }[] = [];
	let quota: { storyCreate: number; storyContinue: number } = { storyCreate: 0, storyContinue: 0 };

	$: isLoggedIn = !!user;

	async function loadQuota(): Promise<void> {
		try {
			const { quota: q } = await aiImageApi.quota();
			quota = { storyCreate: q.storyCreate, storyContinue: q.storyContinue };
		} catch {
			// 忽略
		}
	}

	onMount(() => {
		void blogAuth.refresh().then(() => {
			if (user) {
				void loadQuota();
				void aiStoryApi
					.list()
					.then((r) => (stories = r.stories))
					.catch(() => (stories = []))
					.finally(() => (loading = false));
				const params = new URLSearchParams(window.location.search);
				const id = Number(params.get("id"));
				if (id) void openStory(id);
			}
		});
	});

	async function createStory(genre: string): Promise<void> {
		creating = true;
		try {
			const { story } = await aiStoryApi.create(genre);
			await openStory(story.id);
		} catch (error) {
			emitErrorToast(
				"创建失败",
				error instanceof Error ? error.message : "请稍后再试",
			);
		} finally {
			creating = false;
		}
	}

	async function openStory(id: number): Promise<void> {
		loading = true;
		try {
			const data = await aiStoryApi.detail(id);
			viewStoryId = id;
			storyTitle = data.story.title;
			storyGenre = data.story.genre;
			entries = data.entries.map((e) => ({
				seq: e.seq,
				content: e.content,
				choices: e.choices,
				chosen: e.chosen,
			}));
			history.replaceState(null, "", `/tools/ai-story/?id=${id}`);
		} catch (error) {
			emitErrorToast(
				"加载失败",
				error instanceof Error ? error.message : "故事加载失败",
			);
		} finally {
			loading = false;
		}
	}

	function backToList(): void {
		viewStoryId = null;
		history.replaceState(null, "", "/tools/ai-story/");
		void loadQuota();
		void aiStoryApi
			.list()
			.then((r) => (stories = r.stories))
			.catch(() => (stories = []))
			.finally(() => (loading = false));
	}

	async function choose(choice: string): Promise<void> {
		if (!viewStoryId || continuing) return;
		continuing = true;
		try {
			const { entry } = await aiStoryApi.continue(viewStoryId, choice);
			entries = [...entries, entry];
			void loadQuota();
		} catch (error) {
			emitErrorToast(
				"续写失败",
				error instanceof Error ? error.message : "请稍后再试",
			);
		} finally {
			continuing = false;
		}
	}

	async function removeStory(id: number, title: string): Promise<void> {
		if (!window.confirm(`确定删除《${title}》吗？`)) return;
		try {
			await aiStoryApi.remove(id);
			emitSuccessToast("已删除", "故事已删除");
			await loadQuota();
		} catch (error) {
			emitErrorToast(
				"删除失败",
				error instanceof Error ? error.message : "请稍后再试",
			);
		}
	}

	function formatTime(ts: string): string {
		return ts.slice(0, 16).replace("T", " ");
	}
</script>

<div class="card-base mx-auto w-full max-w-3xl p-6 md:p-8">
	{#if !isLoggedIn}
		<div class="flex flex-col items-center gap-4 py-16 text-center">
			<Icon icon="material-symbols:auto-stories-outline-rounded" class="size-10 text-white/30" />
			<p class="text-white/60">登录后即可体验 AI 互动小说</p>
			<a
				href="/auth/login/?redirect=/tools/ai-story/"
				class="rounded-xl bg-[var(--primary)] px-5 py-2.5 font-bold text-black/80"
				>去登录</a
			>
		</div>
	{:else if viewStoryId}
		<!-- 阅读视图 -->
		<div class="mb-5 flex items-center justify-between gap-3">
			<button
				class="cursor-pointer text-sm text-white/55 hover:text-white/80"
				on:click={backToList}
				>← 返回列表</button
			>
			<span class="text-xs text-white/40">
				今日续写剩余 {quota.storyContinue} 次
			</span>
		</div>
		<h1 class="text-xl font-bold">{storyTitle}</h1>
		<p class="mt-1 text-sm text-white/50">{storyGenre} · {entries.length} 段</p>

		<div class="mt-6 flex flex-col gap-4">
			{#each entries as entry, i (entry.seq)}
				<div class="rounded-xl border border-white/10 bg-white/5 p-4">
					{#if i > 0 && entry.chosen}
						<p class="mb-2 text-xs font-semibold text-[var(--primary)]">
							→ 选择了「{entry.chosen}」
						</p>
					{/if}
					<p class="whitespace-pre-wrap text-[15px] leading-relaxed text-white/85">
						{entry.content}
					</p>
				</div>
			{/each}
		</div>

		{#if entries.length > 0 && !continuing}
			<div class="mt-5">
				<p class="mb-2 text-sm text-white/60">下一步：</p>
				<div class="flex flex-col gap-2">
					{#each entries[entries.length - 1].choices as choice (choice)}
						<button
							class="cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-left text-sm text-white/80 transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary)]/10"
							on:click={() => choose(choice)}
							>{choice}</button
						>
					{/each}
				</div>
			</div>
		{:else if continuing}
			<div class="mt-5 flex items-center justify-center gap-2 py-4 text-sm text-white/50">
				<span class="inline-block size-4 animate-spin rounded-full border-2 border-white/20 border-t-white/70"></span>
				AI 正在续写故事...
			</div>
		{/if}
	{:else}
		<!-- 列表视图 -->
		<div class="mb-6 flex items-center justify-between gap-4 border-b border-white/10 pb-6">
			<div>
				<h1 class="text-xl font-bold">AI 互动小说</h1>
				<p class="mt-1 text-sm text-white/55">
					选择题材，AI 生成故事并给出分支选项，你的选择决定剧情走向
				</p>
			</div>
			<span class="text-xs text-white/40">今日创建剩余 {quota.storyCreate} 次</span>
		</div>

		<!-- 题材选择 -->
		<div class="mb-6">
			<p class="mb-2 text-sm text-white/60">选择题材开始新故事：</p>
			<div class="flex flex-wrap gap-2">
				{#each GENRES as genre (genre)}
					<button
						class="cursor-pointer rounded-full border border-white/15 px-4 py-1.5 text-sm text-white/70 transition-colors hover:border-[var(--primary)] hover:text-white disabled:opacity-50"
						disabled={creating}
						on:click={() => createStory(genre)}
						>{creating ? "生成中..." : genre}</button
					>
				{/each}
			</div>
		</div>

		<!-- 我的故事 -->
		<h2 class="mb-3 text-sm font-semibold text-white/70">我的故事</h2>
		{#if loading}
			<div class="flex justify-center py-10 text-sm text-white/40">加载中...</div>
		{:else if stories.length === 0}
			<div class="flex flex-col items-center gap-2 py-10 text-center">
				<Icon icon="material-symbols:auto-stories-outline-rounded" class="size-8 text-white/25" />
				<p class="text-sm text-white/40">还没有故事，选一个题材开始吧</p>
			</div>
		{:else}
			<div class="flex flex-col gap-3">
				{#each stories as story (story.id)}
					<div class="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
						<button
							class="min-w-0 cursor-pointer text-left"
							on:click={() => openStory(story.id)}
						>
							<h3 class="truncate text-base font-semibold hover:text-[var(--primary)]">
								{story.title}
							</h3>
							<p class="mt-1 text-xs text-white/40">
								{story.genre} · {story.entries} 段 · 更新于 {formatTime(story.updatedAt)}
							</p>
						</button>
						<button
							class="shrink-0 cursor-pointer rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/50 transition-colors hover:bg-white/10"
							on:click={() => removeStory(story.id, story.title)}
							>删除</button
						>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
