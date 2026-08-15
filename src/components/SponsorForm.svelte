<script lang="ts">
	import { onMount } from "svelte";
	import { sponsorsApi } from "@/blog/api";
	import { blogAuth } from "@/blog/stores/auth";
	import { emitErrorToast, emitSuccessToast } from "@/forum/utils/toast";
	import Icon from "@components/IconSvelte.svelte";

	let displayName = "";
	let amount = "";
	let anonymous = false;
	let remark = "";
	let submitting = false;
	let submitted = false;

	$: user = $blogAuth.user;
	$: isLoggedIn = !!user;

	// 已登录：自动带出账号昵称（可修改），仅在首次填充
	$: if (user && !displayName.trim()) {
		displayName = user.displayName;
	}

	onMount(() => {
		void blogAuth.refresh();
	});

	async function submit(): Promise<void> {
		const name = displayName.trim();
		const value = Number(amount);
		if (!name) {
			emitErrorToast("提交失败", "请填写昵称");
			return;
		}
		if (name.length > 24) {
			emitErrorToast("提交失败", "昵称不能超过 24 个字符");
			return;
		}
		if (!amount || !Number.isFinite(value) || value < 0.01 || value > 99999) {
			emitErrorToast("提交失败", "请填写正确的赞助金额（0.01 - 99999）");
			return;
		}
		submitting = true;
		try {
			await sponsorsApi.submit({
				displayName: name,
				amount: value,
				anonymous,
				remark: remark.trim(),
			});
			submitted = true;
			emitSuccessToast("已提交", "感谢支持！审核通过后就会出现在名单中");
		} catch (error) {
			emitErrorToast(
				"提交失败",
				error instanceof Error ? error.message : "请稍后再试",
			);
		} finally {
			submitting = false;
		}
	}
</script>

<div class="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 md:p-5">
	{#if submitted}
		<div class="flex items-center gap-3">
			<Icon
				icon="material-symbols:check-circle-rounded"
				class="size-9 text-[var(--primary)]"
			/>
			<div>
				<p class="font-semibold">已收到你的登记，感谢支持！</p>
				<p class="mt-0.5 text-sm text-[var(--muted-foreground)]">
					审核通过后，你的名字就会出现在下方名单中
				</p>
			</div>
		</div>
	{:else if !isLoggedIn}
		<div class="flex flex-col items-start gap-2">
			<p class="text-sm text-[var(--muted-foreground)]">
				打赏后想留下名字？登录后即可登记（昵称将自动带出，可修改）
			</p>
			<a
				href="/auth/login/?redirect=/sponsors/"
				class="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
			>
				去登录
			</a>
		</div>
	{:else}
		<div>
			<p class="mb-3 text-sm font-semibold">我也赞助了，登记一下 ✨</p>
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<label class="block">
					<span class="mb-1 block text-xs text-[var(--muted-foreground)]">昵称</span>
					<input
						bind:value={displayName}
						type="text"
						maxlength="24"
						placeholder="展示在名单中的名字"
						class="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none transition focus:border-[var(--primary)]"
					/>
				</label>
				<label class="block">
					<span class="mb-1 block text-xs text-[var(--muted-foreground)]">金额（¥）</span>
					<input
						bind:value={amount}
						type="number"
						min="0.01"
						max="99999"
						step="0.01"
						inputmode="decimal"
						placeholder="如 5.00"
						class="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none transition focus:border-[var(--primary)]"
					/>
				</label>
			</div>
			<label class="mt-3 block">
				<span class="mb-1 block text-xs text-[var(--muted-foreground)]">备注（选填）</span>
				<input
					bind:value={remark}
					type="text"
					maxlength="200"
					placeholder="想说点什么？（仅管理员可见）"
					class="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none transition focus:border-[var(--primary)]"
				/>
			</label>
			<div class="mt-3 flex items-center gap-2">
				<input
					bind:checked={anonymous}
					type="checkbox"
					id="sponsor-anonymous"
					class="h-4 w-4 accent-[var(--primary)]"
				/>
				<label for="sponsor-anonymous" class="text-sm text-[var(--muted-foreground)]">
					匿名赞助（名单中显示为"匿名用户"）
				</label>
			</div>
			<button
				type="button"
				disabled={submitting}
				on:click={submit}
				class="mt-4 rounded-lg bg-[var(--primary)] px-5 py-2 text-sm font-semibold text-[var(--primary-foreground)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{submitting ? "提交中…" : "提交登记"}
			</button>
		</div>
	{/if}
</div>
