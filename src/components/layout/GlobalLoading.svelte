<script lang="ts">
	import { loadingState } from "@/forum/utils/loading";

	$: state = $loadingState;
</script>

{#if state.active}
	<!-- 全屏遮罩：拦截所有点击，界面不可操作 -->
	<div
		class="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 backdrop-blur-sm"
		role="alert"
		aria-live="assertive"
	>
		<div class="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-[#0f1218] px-8 py-6 shadow-2xl">
			<span
				class="size-8 animate-spin rounded-full border-[3px] border-white/15 border-t-[var(--primary)]"
				aria-hidden="true"
			></span>
			<p class="max-w-60 text-center text-sm text-white/80">{state.message}</p>
		</div>
	</div>
{/if}
