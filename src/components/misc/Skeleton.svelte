<script lang="ts">
	/** 通用骨架面板：若干 shimmer 行，用于异步区块加载占位（配色与 PostCard 一致） */
	export let rows = 3;
	export let widths: string[] = [];
	export let gap = "0.75rem";
	export let rowHeight = "0.875rem";
</script>

<div class="skeleton-panel" aria-hidden="true" style="gap: {gap}">
	{#each Array.from({ length: rows }) as _, i}
		<div class="skeleton-line" style="width: {widths[i] ?? "100%"}; height: {rowHeight}"></div>
	{/each}
</div>

<style>
	.skeleton-panel {
		display: flex;
		flex-direction: column;
		padding: 0.25rem 0;
	}
	.skeleton-line {
		border-radius: 0.25rem;
		background-color: #262626;
		background-image:
			repeating-linear-gradient(
				45deg,
				transparent 0,
				transparent 10px,
				rgba(255, 255, 255, 0.07) 10px,
				rgba(255, 255, 255, 0.07) 20px
			),
			linear-gradient(
				100deg,
				rgba(255, 255, 255, 0.05) 40%,
				rgba(255, 255, 255, 0.14) 50%,
				rgba(255, 255, 255, 0.05) 60%
			);
		background-size:
			auto,
			200% 100%;
		animation: skeleton-shimmer 1.4s infinite;
	}
	@keyframes skeleton-shimmer {
		0% {
			background-position:
				0 0,
				120% 0;
		}
		100% {
			background-position:
				0 0,
				-80% 0;
		}
	}
</style>
