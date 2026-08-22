<script lang="ts">
	import { onMount } from "svelte";
	import { BLOG_API_BASE, shareApi, type ShareFileItem } from "@/blog/api";
	import { blogAuth } from "@/blog/stores/auth";
	import { emitErrorToast, emitSuccessToast } from "@/forum/utils/toast";
	import Icon from "@components/IconSvelte.svelte";
	import Skeleton from "@/components/misc/Skeleton.svelte";

	const EXPIRY_OPTIONS = [
		{ label: "1 天", value: 1 },
		{ label: "7 天（默认）", value: 7 },
		{ label: "30 天", value: 30 },
		{ label: "永久", value: 0 },
	];

	let user = $blogAuth.user;
	let selectedFile: File | null = null;
	let expiresInDays = 7;
	let uploading = false;
	let files: ShareFileItem[] = [];
	let loadingList = true;
	let recentUpload: { id: string; rawUrl: string; status: "approved" | "pending" } | null = null;

	// 浏览视图（?id=xxx，公开可看，无需登录）
	let viewing: { id: string; rawUrl: string; filename: string; size: number } | null = null;
	let viewContent = "";
	let viewLoading = false;

	$: isLoggedIn = !!user;

	function formatSize(n: number): string {
		if (n < 1024) return `${n} B`;
		return `${(n / 1024).toFixed(1)} KB`;
	}

	function formatTime(ts: string): string {
		const date = new Date(ts);
		if (Number.isNaN(date.getTime())) return ts;
		const pad = (n: number) => String(n).padStart(2, "0");
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
	}

	function isExpired(f: ShareFileItem): boolean {
		return !!f.expiresAt && new Date(f.expiresAt).getTime() <= Date.now();
	}

	/** 过期剩余时间文案 */
	function remainText(ts: string): string {
		const remain = new Date(ts).getTime() - Date.now();
		if (remain <= 0) return "已过期";
		const days = Math.floor(remain / 86400_000);
		if (days > 0) return `${days} 天后过期`;
		const hours = Math.floor(remain / 3600_000);
		if (hours > 0) return `${hours} 小时后过期`;
		return `${Math.floor(remain / 60_000)} 分钟后过期`;
	}

	async function refreshList(): Promise<void> {
		try {
			const { files: list } = await shareApi.my();
			files = list;
		} catch {
			files = [];
		} finally {
			loadingList = false;
		}
	}

	async function copyText(text: string, btnEl: HTMLElement): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
			const original = btnEl.textContent;
			btnEl.textContent = "已复制 ✓";
			btnEl.classList.add("text-[var(--primary)]");
			setTimeout(() => {
				btnEl.textContent = original;
				btnEl.classList.remove("text-[var(--primary)]");
			}, 1500);
		} catch {
			emitErrorToast("复制失败", "请手动复制链接");
		}
	}

	async function submitUpload(): Promise<void> {
		if (!selectedFile) {
			emitErrorToast("上传", "请先选择 .txt 文件");
			return;
		}
		if (!selectedFile.name.toLowerCase().endsWith(".txt")) {
			emitErrorToast("上传", "仅支持 .txt 文本文件");
			return;
		}
		if (selectedFile.size > 1024 * 1024) {
			emitErrorToast("上传", "文件不能超过 1MB");
			return;
		}
		uploading = true;
		try {
			const data = await shareApi.upload(selectedFile, expiresInDays);
			recentUpload = data;
			emitSuccessToast(
				"上传成功",
				data.status === "approved" ? "链接已生成" : "已进入待审核队列，通过后即可访问",
			);
			selectedFile = null;
			void refreshList();
		} catch (error) {
			emitErrorToast(
				"上传失败",
				error instanceof Error ? error.message : "请稍后再试",
			);
		} finally {
			uploading = false;
		}
	}

	async function removeFile(id: string, filename: string): Promise<void> {
		if (!window.confirm(`确定删除《${filename}》吗？删除后链接立即失效。`)) return;
		try {
			await shareApi.remove(id);
			emitSuccessToast("已删除", "文件与链接已移除");
			await refreshList();
		} catch (error) {
			emitErrorToast(
				"删除失败",
				error instanceof Error ? error.message : "请稍后再试",
			);
		}
	}

	/** 浏览视图：公开读取（无需登录），支持他人分享的链接 */
	async function openView(id: string): Promise<void> {
		const known = files.find((f) => f.id === id);
		const rawUrl = known
			? known.rawUrl
			: `${
					BLOG_API_BASE.startsWith("http") ? BLOG_API_BASE : location.origin
				}/share/${id}.txt`;
		viewing = {
			id,
			rawUrl,
			filename: known?.filename ?? `${id.slice(0, 8)}.txt`,
			size: known?.size ?? 0,
		};
		viewLoading = true;
		viewContent = "";
		history.replaceState(null, "", `/tools/clash-share/?id=${id}`);
		try {
			const res = await fetch(rawUrl);
			if (!res.ok) {
				emitErrorToast(
					"无法读取",
					res.status === 404 ? "文件不存在或已过期/未审核" : `读取失败（${res.status}）`,
				);
				viewing = null;
				history.replaceState(null, "", "/tools/clash-share/");
				return;
			}
			viewContent = await res.text();
		} catch {
			emitErrorToast("无法读取", "网络错误，请稍后再试");
			viewing = null;
			history.replaceState(null, "", "/tools/clash-share/");
		} finally {
			viewLoading = false;
		}
	}

	function backToList(): void {
		viewing = null;
		history.replaceState(null, "", "/tools/clash-share/");
	}

	function viewUrl(id: string): string {
		return `${location.origin}/tools/clash-share/?id=${id}`;
	}

	onMount(() => {
		void blogAuth.refresh().then(() => {
			if (user) void refreshList();
			else loadingList = false;
			const id = new URLSearchParams(window.location.search).get("id");
			if (id) void openView(id);
		});
	});
</script>

<div class="card-base mx-auto w-full max-w-3xl p-6 md:p-8">
	{#if viewing}
		<!-- 浏览视图：纯文本内容展示 -->
		<div class="mb-4 flex items-center justify-between gap-3">
			<button
				class="cursor-pointer text-sm text-white/55 hover:text-white/80"
				on:click={backToList}
				>← 返回</button
			>
			<span class="text-xs text-white/40">{viewing.id.slice(0, 8)}</span>
		</div>
		<h1 class="truncate text-lg font-bold">{viewing.filename}</h1>
		<p class="mt-1 text-xs text-white/45">
			{viewing.size ? formatSize(viewing.size) : "共享文件"}
		</p>

		{#if viewLoading}
			<div class="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
				<Skeleton rows={6} widths={["100%", "90%", "95%", "80%", "92%", "70%"]} gap="0.75rem" />
			</div>
		{:else}
			<div class="mt-4 flex items-center gap-2">
				<a
					href={viewing.rawUrl}
					target="_blank"
					class="cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-[var(--primary)]"
					>打开原文</a
				>
				<a
					href={viewing.rawUrl}
					download
					class="cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-[var(--primary)]"
					>下载</a
				>
				<button
					class="cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-[var(--primary)]"
					on:click={(e) => copyText(viewContent, e.currentTarget)}
					>复制全文</button
				>
			</div>
			<pre
				class="mt-3 max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded-xl border border-white/10 bg-white/5 p-4 text-[13px] leading-relaxed text-white/85"
			>{viewContent}</pre>
		{/if}
	{:else if !isLoggedIn}
		<div class="flex flex-col items-center gap-4 py-16 text-center">
			<Icon icon="material-symbols:link-rounded" class="size-10 text-white/30" />
			<p class="text-white/60">登录后即可上传 txt 文件生成分享链接</p>
			<a
				href="/auth/login/?redirect=/tools/clash-share/"
				class="rounded-xl bg-[var(--primary)] px-5 py-2.5 font-bold text-black/80"
				>去登录</a
			>
		</div>
	{:else}
		<!-- 上传区 -->
		<div class="mb-6">
			<h1 class="text-xl font-bold">Clash 配置分享</h1>
			<p class="mt-1 text-sm text-white/55">
				上传 .txt 文本（如 Clash/Mihomo 配置），生成公网链接，直接在浏览器或 Clash
				客户端中读取
			</p>
		</div>

		<div class="rounded-xl border border-white/10 bg-white/5 p-4">
			<label
				class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/[0.03] py-10 text-center transition-colors hover:border-[var(--primary)]"
			>
				<Icon icon="material-symbols:upload-file-rounded" class="size-8 text-white/35" />
				<span class="text-sm text-white/70">
					{selectedFile ? selectedFile.name : "点击选择 .txt 文件（≤ 1MB）"}
				</span>
				{#if selectedFile}
					<span class="text-xs text-white/45">{formatSize(selectedFile.size)}</span>
				{/if}
				<input
					type="file"
					accept=".txt,text/plain"
					class="hidden"
					on:change={(e) => {
						selectedFile = e.currentTarget.files?.[0] ?? null;
					}}
				/>
			</label>

			<div class="mt-4 flex flex-wrap items-center gap-3">
				<span class="text-sm text-white/60">过期时间：</span>
				<div class="flex flex-wrap gap-1.5">
					{#each EXPIRY_OPTIONS as opt (opt.value)}
						<button
							class="cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors {expiresInDays ===
							opt.value
								? "border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]"
								: "border-white/15 text-white/60 hover:border-[var(--primary)]"}"
							on:click={() => (expiresInDays = opt.value)}
							>{opt.label}</button
						>
					{/each}
				</div>
				<button
					class="ml-auto cursor-pointer rounded-xl bg-[var(--primary)] px-5 py-2 text-sm font-bold text-black/80 transition-opacity disabled:opacity-50"
					disabled={uploading || !selectedFile}
					on:click={submitUpload}
					>{uploading ? "上传中..." : "生成链接"}</button
				>
			</div>
			<p class="mt-2 text-xs text-white/35">
				每人活跃文件上限 10 个；超出后新上传需管理员审核，通过后方可访问。
			</p>
		</div>

		<!-- 上传成功卡片 -->
		{#if recentUpload}
			<div class="mt-4 rounded-xl border border-[var(--primary)]/40 bg-[var(--primary)]/10 p-4">
				<div class="mb-3 flex items-center justify-between gap-2">
					<h2 class="text-sm font-bold text-[var(--primary)]">链接已生成</h2>
					{#if recentUpload.status === "pending"}
						<span class="rounded-full bg-yellow-500/20 px-2.5 py-0.5 text-xs text-yellow-400"
							>等待管理员审核</span
						>
					{:else}
						<span class="rounded-full bg-[var(--primary)]/25 px-2.5 py-0.5 text-xs text-[var(--primary)]"
							>已生效</span
						>
					{/if}
				</div>

				<p class="mb-1 text-xs text-white/55">Clash 订阅/配置链接（粘贴到 Clash/Mihomo 客户端）</p>
				<div class="flex items-center gap-2">
					<code
						class="min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/80"
						title={recentUpload.rawUrl}
						>{recentUpload.rawUrl}</code
					>
					<button
						class="shrink-0 cursor-pointer rounded-lg border border-white/15 px-3 py-2 text-xs text-white/70 transition-colors hover:border-[var(--primary)]"
						on:click={(e) => copyText(recentUpload.rawUrl, e.currentTarget)}
						>复制</button
					>
				</div>

				<p class="mt-3 mb-1 text-xs text-white/55">浏览器查看页</p>
				<div class="flex items-center gap-2">
					<code
						class="min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/80"
						title={viewUrl(recentUpload.id)}
						>{viewUrl(recentUpload.id)}</code
					>
					<button
						class="shrink-0 cursor-pointer rounded-lg border border-white/15 px-3 py-2 text-xs text-white/70 transition-colors hover:border-[var(--primary)]"
						on:click={(e) => copyText(viewUrl(recentUpload.id), e.currentTarget)}
						>复制</button
					>
					<a
						href={viewUrl(recentUpload.id)}
						class="shrink-0 cursor-pointer rounded-lg border border-white/15 px-3 py-2 text-xs text-white/70 transition-colors hover:border-[var(--primary)]"
						>打开</a
					>
				</div>
			</div>
		{/if}

		<!-- 我的文件 -->
		<h2 class="mb-3 mt-6 text-sm font-semibold text-white/70">我的文件</h2>
		{#if loadingList}
			<div class="rounded-xl border border-white/10 bg-white/5 p-4">
				<Skeleton rows={3} widths={["100%", "85%", "70%"]} gap="1rem" />
			</div>
		{:else if files.length === 0}
			<div class="flex flex-col items-center gap-2 py-10 text-center">
				<Icon icon="material-symbols:text-snippet" class="size-8 text-white/25" />
				<p class="text-sm text-white/40">还没有上传过文件</p>
			</div>
		{:else}
			<div class="flex flex-col gap-2">
				{#each files as file (file.id)}
					{@const expired = isExpired(file)}
					<div
						class="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
					>
						<div class="min-w-0">
							<p class="truncate text-sm text-white/85" title={file.filename}>
								{file.filename}
							</p>
							<p class="mt-0.5 text-xs text-white/40">
								{formatSize(file.size)} · 上传于 {formatTime(file.createdAt)}
								{#if file.expiresAt} · {remainText(file.expiresAt)}{/if}
							</p>
						</div>
						<div class="flex shrink-0 items-center gap-1.5">
							{#if expired}
								<span class="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/40"
									>已过期</span
								>
							{:else if file.status === "pending"}
								<span class="rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-400"
									>待审核</span
								>
							{:else}
								<span class="rounded-full bg-[var(--primary)]/25 px-2 py-0.5 text-xs text-[var(--primary)]"
									>已生效</span
								>
							{/if}
							{#if !expired && file.status === "approved"}
								<button
									class="cursor-pointer rounded-lg border border-white/15 px-2 py-1 text-xs text-white/60 transition-colors hover:border-[var(--primary)]"
									on:click={() => openView(file.id)}
									>查看</button
								>
								<button
									class="cursor-pointer rounded-lg border border-white/15 px-2 py-1 text-xs text-white/60 transition-colors hover:border-[var(--primary)]"
									on:click={(e) => copyText(file.rawUrl, e.currentTarget)}
									>复制链接</button
								>
							{/if}
							<button
								class="cursor-pointer rounded-lg border border-white/15 px-2 py-1 text-xs text-white/50 transition-colors hover:border-red-400 hover:text-red-400"
								on:click={() => removeFile(file.id, file.filename)}
								>删除</button
							>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>