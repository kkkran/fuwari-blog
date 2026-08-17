<script lang="ts">
	import { onMount } from "svelte";
	import { aiImageApi, type AiImageItem } from "@/blog/api";
	import { blogAuth } from "@/blog/stores/auth";
	import { emitErrorToast } from "@/forum/utils/toast";
	import { startLoading, stopLoading } from "@/forum/utils/loading";
	import Skeleton from "@/components/misc/Skeleton.svelte";
	import Icon from "@components/IconSvelte.svelte";

	const RATIOS = ["1:1", "16:9", "9:16"];
	const STYLES = ["写实", "插画", "像素", "赛博朋克", "水墨"];

	let user = $blogAuth.user;
	let prompt = "";
	let ratio = "1:1";
	let style = "";
	let generating = false;
	let historyLoading = true;
	let images: AiImageItem[] = [];
	let quotaLeft = 0;

	$: isLoggedIn = !!user;

	onMount(() => {
		void blogAuth.refresh().then(() => {
			if (user) {
				void loadHistory();
				void loadQuota();
			}
		});
	});

	async function loadQuota(): Promise<void> {
		try {
			const { quota } = await aiImageApi.quota();
			quotaLeft = quota.imageGenerate;
		} catch {
			// 忽略
		}
	}

	async function loadHistory(): Promise<void> {
		historyLoading = true;
		try {
			const { images: list } = await aiImageApi.list();
			images = list;
		} catch {
			images = [];
		} finally {
			historyLoading = false;
		}
	}

	async function generate(): Promise<void> {
		const p = prompt.trim();
		if (!p) {
			emitErrorToast("生成失败", "请填写图片描述提示词");
			return;
		}
		generating = true;
		startLoading("AI 正在绘制图片，请耐心等待（约 10-30 秒）...");
		try {
			const { image } = await aiImageApi.generate({ prompt: p, ratio, style });
			images = [image, ...images];
			prompt = "";
			void loadQuota();
		} catch (error) {
			emitErrorToast(
				"生成失败",
				error instanceof Error ? error.message : "请稍后再试",
			);
		} finally {
			stopLoading();
			generating = false;
		}
	}

	async function removeImage(id: number): Promise<void> {
		if (!window.confirm("确定删除这张生成记录吗？")) return;
		try {
			await aiImageApi.remove(id);
			images = images.filter((img) => img.id !== id);
		} catch {
			// 忽略
		}
	}
</script>

<div class="card-base mx-auto w-full max-w-3xl p-6 md:p-8">
	{#if !isLoggedIn}
		<div class="flex flex-col items-center gap-4 py-16 text-center">
			<Icon icon="material-symbols:auto-awesome-outline-rounded" class="size-10 text-white/30" />
			<p class="text-white/60">登录后即可使用 AI 图片生成</p>
			<a
				href="/auth/login/?redirect=/tools/ai-image/"
				class="rounded-xl bg-[var(--primary)] px-5 py-2.5 font-bold text-black/80"
				>去登录</a
			>
		</div>
	{:else}
		<div class="mb-6 flex items-center justify-between gap-4 border-b border-white/10 pb-6">
			<div>
				<h1 class="text-xl font-bold">AI 图片生成</h1>
				<p class="mt-1 text-sm text-white/55">
					描述你的画面，AI 为你绘制（生成结果自动保存到本地图库）
				</p>
			</div>
			<span class="text-xs text-white/40">今日剩余 {quotaLeft} 次</span>
		</div>

		<!-- 生成表单 -->
		<div class="flex flex-col gap-3">
			<textarea
				bind:value={prompt}
				placeholder="描述你想生成的画面，如：一只在星空中飞行的猫，身边环绕着发光的星云"
				maxlength="500"
				rows="3"
				class="w-full resize-y rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-[var(--primary)]"
			></textarea>

			<div class="flex flex-wrap items-center gap-2">
				<span class="text-xs text-white/50">比例：</span>
				{#each RATIOS as r (r)}
					<button
						class="cursor-pointer rounded-full px-3 py-1 text-xs transition-colors {ratio === r
							? 'bg-[var(--primary)] text-black/80'
							: 'border border-white/15 text-white/60 hover:bg-white/10'}"
						on:click={() => (ratio = r)}
						>{r}</button
					>
				{/each}
				<span class="ml-3 text-xs text-white/50">风格：</span>
				{#each STYLES as s (s)}
					<button
						class="cursor-pointer rounded-full px-3 py-1 text-xs transition-colors {style === s
							? 'bg-[var(--primary)] text-black/80'
							: 'border border-white/15 text-white/60 hover:bg-white/10'}"
						on:click={() => (style = style === s ? "" : s)}
						>{s}</button
					>
				{/each}
			</div>

			<button
				class="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-2.5 text-sm font-bold text-black/80 transition-opacity disabled:opacity-60"
				disabled={generating}
				on:click={() => generate()}
			>
				{#if generating}
					<span class="inline-block size-4 animate-spin rounded-full border-2 border-black/20 border-t-black/70"></span>
					AI 绘制中...
				{:else}
					<Icon icon="material-symbols:auto-awesome-outline-rounded" class="size-4" />
					生成图片
				{/if}
			</button>
		</div>

		<!-- 历史 -->
		<h2 class="mb-3 mt-8 text-sm font-semibold text-white/70">我的生成</h2>
		{#if historyLoading}
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
				{#each [1, 2, 3, 4, 5, 6] as i (i)}
					<div class="aspect-square rounded-xl border border-white/10 bg-white/5 p-3">
						<Skeleton rows={3} widths={["100%", "80%", "60%"]} gap="0.9rem" />
					</div>
				{/each}
			</div>
		{:else if images.length === 0}
			<div class="flex flex-col items-center gap-2 py-10 text-center">
				<Icon icon="material-symbols:image-outline-rounded" class="size-8 text-white/25" />
				<p class="text-sm text-white/40">还没有生成记录</p>
			</div>
		{:else}
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
				{#each images as image (image.id)}
					<div class="group relative overflow-hidden rounded-xl border border-white/10 bg-white/5">
						<img
							src={image.url}
							alt={image.prompt}
							loading="lazy"
							class="aspect-square w-full object-cover"
						/>
						<div
							class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100"
						>
							<p class="line-clamp-2 text-xs text-white/80">{image.prompt}</p>
							<p class="mt-0.5 text-[10px] text-white/50">
								{image.ratio}{image.style ? ` · ${image.style}` : ""}
							</p>
							<button
								class="mt-1 cursor-pointer rounded bg-white/15 px-1.5 py-0.5 text-[10px] text-white/70 hover:bg-white/25"
								on:click={() => removeImage(image.id)}
								>删除</button
							>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
