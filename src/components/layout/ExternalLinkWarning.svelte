<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import Icon from "@components/IconSvelte.svelte";

	/**
	 * 外站跳转警告：点击外部链接时弹出确认（避免误触跳走），确认后在新标签页打开。
	 * 同站子域（*.miscoke.top）不拦截；链接带 data-no-warning 属性可跳过提示。
	 */
	let pendingUrl: string | null = null;
	let pendingHost = "";

	function isSameSite(href: string): boolean {
		try {
			const u = new URL(href, window.location.href);
			const host = u.host;
			if (host === window.location.host) return true;
			// 同站子域（如 img.miscoke.top）视为站内
			if (host.endsWith(".miscoke.top")) return true;
			return false;
		} catch {
			return true; // 解析失败按站内处理，不拦截
		}
	}

	function handleClick(e: MouseEvent): void {
		// 仅左键单击，且未被其他逻辑处理过
		if (e.defaultPrevented || e.button !== 0) return;
		const target = e.target as Element | null;
		const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
		if (!anchor) return;
		const href = anchor.getAttribute("href") ?? "";
		if (!/^https?:\/\//i.test(href)) return;
		if (anchor.hasAttribute("data-no-warning")) return;
		if (isSameSite(href)) return;

		e.preventDefault();
		try {
			pendingHost = new URL(href).host;
		} catch {
			pendingHost = href;
		}
		pendingUrl = href;
	}

	function confirmGo(): void {
		if (pendingUrl) {
			window.open(pendingUrl, "_blank", "noopener,noreferrer");
		}
		pendingUrl = null;
	}

	function cancel(): void {
		pendingUrl = null;
	}

	onMount(() => {
		document.addEventListener("click", handleClick, true);
	});

	onDestroy(() => {
		document.removeEventListener("click", handleClick, true);
	});
</script>

{#if pendingUrl}
	<div
		class="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4"
		role="alertdialog"
		aria-modal="true"
		on:click={cancel}
	>
		<div
			class="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0f1218] p-5 shadow-2xl"
			on:click|stopPropagation
		>
			<div class="flex items-center gap-2">
				<Icon
					icon="material-symbols:open-in-new-rounded"
					class="text-lg text-[var(--primary)]"
				/>
				<h2 class="text-sm font-bold">即将离开本站</h2>
			</div>
			<p class="mt-3 text-sm leading-relaxed text-white/60">
				你正在前往外部网站 <span class="font-medium text-white/85">{pendingHost}</span>
				，其内容与本站无关。
			</p>
			<p class="mt-2 break-all rounded-lg bg-white/5 px-3 py-2 font-mono text-xs text-white/50">
				{pendingUrl}
			</p>
			<div class="mt-4 flex justify-end gap-2">
				<button
					class="cursor-pointer rounded-lg border border-white/10 px-4 py-2 text-xs text-white/60 transition-colors hover:bg-white/5"
					on:click={cancel}
					>取消</button
				>
				<button
					class="cursor-pointer rounded-lg bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-black/80 transition-opacity hover:opacity-90"
					on:click={confirmGo}
					>继续访问</button
				>
			</div>
		</div>
	</div>
{/if}
