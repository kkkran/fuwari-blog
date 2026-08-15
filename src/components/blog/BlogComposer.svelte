<script lang="ts">
	import { onMount } from "svelte";
	import BlogMarkdownEditor from "@/components/blog/BlogMarkdownEditor.svelte";
	import { blogApi } from "@/blog/api";
	import { blogAuth } from "@/blog/stores/auth";
	import { createDraftStore, NEW_DRAFT_KEY } from "@/utils/blog-draft";
	import { emitErrorToast, emitSuccessToast } from "@/forum/utils/toast";
	import Icon from "@components/IconSvelte.svelte";

	let title = "";
	let slug = "";
	let description = "";
	let image = "";
	let tagsText = "";
	let content = "";
	let loading = false;
	let submitting = false;
	let editSlug: string | null = null;
	let loaded = false;
	let restoredDraftAt: number | null = null;
	const draftStore = createDraftStore(window.localStorage);

	// 仅新建态启用草稿（编辑态以服务器内容为准，不自动保存/恢复）
	$: draftKey = isEdit ? null : NEW_DRAFT_KEY;

	function formatDraftTime(ts: number): string {
		return new Date(ts).toLocaleTimeString("zh-CN", {
			hour: "2-digit",
			minute: "2-digit",
		});
	}

	function discardRestoredDraft(): void {
		draftStore.clear(NEW_DRAFT_KEY);
		restoredDraftAt = null;
	}

	$: user = $blogAuth.user;
	$: isEdit = editSlug !== null;

	async function loadEditPost(): Promise<void> {
		if (!editSlug) return;
		try {
			const { post } = await blogApi.getMine(editSlug);
			title = post.title;
			slug = post.slug;
			description = post.description;
			image = post.image;
			tagsText = post.tags.join(", ");
			content = post.content;
			loaded = true;
		} catch (error) {
			emitErrorToast(
				"加载失败",
				error instanceof Error ? error.message : "文章加载失败",
			);
			window.location.href = "/blog/manage/";
		}
	}

	function handleSubmit(): void {
		void submit();
	}

	async function submit(): Promise<void> {
		if (!title.trim()) {
			emitErrorToast("提交失败", "请填写标题");
			return;
		}
		if (!content.trim()) {
			emitErrorToast("提交失败", "请填写正文内容");
			return;
		}
		submitting = true;
		try {
			const payload = {
				title: title.trim(),
				slug: slug.trim() || undefined,
				description: description.trim(),
				image: image.trim(),
				tags: tagsText
					.split(",")
					.map((tag) => tag.trim())
					.filter(Boolean),
				content,
			};
			if (isEdit && editSlug) {
				await blogApi.update(editSlug, payload);
				emitSuccessToast("提交成功", "修改已提交，等待审核", true);
			} else {
				await blogApi.create(payload);
				emitSuccessToast("提交成功", "文章已提交，等待审核", true);
			}
			// 提交成功后清除草稿
			draftStore.clear(NEW_DRAFT_KEY);
			window.location.href = "/blog/manage/";
		} catch (error) {
			emitErrorToast(
				"提交失败",
				error instanceof Error ? error.message : "提交失败，请稍后再试",
			);
		} finally {
			submitting = false;
		}
	}

	onMount(async () => {
		await blogAuth.refresh();
		const params = new URLSearchParams(window.location.search);
		editSlug = params.get("edit");
		await loadEditPost();
		if (!editSlug) {
			// 新建态：自动恢复本地草稿
			const draft = draftStore.load(NEW_DRAFT_KEY);
			if (draft && draft.content) {
				content = draft.content;
				restoredDraftAt = draft.savedAt;
			}
		}
	});
</script>

<div class="card-base mx-auto w-full max-w-5xl p-6 md:p-8">
	<div class="mb-6 flex items-center justify-between gap-4 border-b border-white/10 pb-6">
		<div>
			<h1 class="text-xl font-bold">{isEdit ? "编辑文章" : "写文章"}</h1>
			<p class="mt-1 text-sm text-white/55">
				{isEdit
					? "修改已发布的文章会使其重新进入审核流程"
					: "提交后需管理员审核，通过后自动公开"}
			</p>
		</div>
		{#if user?.role === "admin"}
			<span class="rounded-full bg-[var(--primary)]/20 px-3 py-1 text-xs font-semibold text-[var(--primary)]"
				>管理员</span
			>
		{/if}
	</div>

	{#if !user}
		<div class="flex flex-col items-center gap-4 py-16 text-center">
			<p class="text-white/60">登录后即可发布博客文章</p>
			<a
				href="/auth/login/?redirect=/blog/new/"
				class="rounded-xl bg-[var(--primary)] px-5 py-2.5 font-bold text-black/80"
				>去登录</a
			>
		</div>
	{:else}
		{#if restoredDraftAt}
			<div class="mb-4 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
				<span class="text-sm text-white/70">
					已恢复草稿（保存于 {formatDraftTime(restoredDraftAt)}）
				</span>
				<button
					class="cursor-pointer text-xs text-white/50 transition-colors hover:text-white"
					on:click={discardRestoredDraft}
					>清除草稿</button
				>
			</div>
		{/if}
		<div class="flex flex-col gap-4">
			<input
				bind:value={title}
				placeholder="标题"
				maxlength="120"
				class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-lg font-semibold outline-none focus:border-[var(--primary)]"
			/>

			<div class="grid gap-4 sm:grid-cols-2">
				<input
					bind:value={slug}
					placeholder="slug（可选，留空自动生成）"
					class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-[var(--primary)]"
				/>
				<input
					bind:value={image}
					placeholder="封面图片 URL（可选）"
					class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-[var(--primary)]"
				/>
			</div>

			<input
				bind:value={tagsText}
				placeholder="标签，用逗号分隔（可选）"
				class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-[var(--primary)]"
			/>

			<textarea
				bind:value={description}
				placeholder="摘要（可选，最多 300 字）"
				maxlength="300"
				rows="3"
				class="w-full resize-y rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-[var(--primary)]"
			></textarea>

			<BlogMarkdownEditor
				bind:value={content}
				submitting={submitting}
				minHeight={560}
				draftKey={draftKey}
				on:submit={handleSubmit}
			/>

			<div class="flex items-center justify-between gap-4 border-t border-white/10 pt-4">
				<a href="/blog/manage/" class="text-sm text-white/55 hover:text-white/80"
					>← 返回我的文章</a
				>
				<button
					class="flex items-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-2.5 font-bold text-black/80 transition-opacity disabled:opacity-60"
					disabled={submitting}
					on:click={handleSubmit}
				>
					{#if submitting}
						<Icon icon="svg-spinners:ring-resize" class="size-4" />
					{/if}
					{isEdit ? "更新并重新提交" : "提交审核"}
				</button>
			</div>
		</div>
	{/if}
</div>
