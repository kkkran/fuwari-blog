<script lang="ts">
	import { onMount } from "svelte";
	import { friendsApi } from "@/blog/api";
	import { blogAuth } from "@/blog/stores/auth";
	import { emitErrorToast, emitSuccessToast } from "@/forum/utils/toast";

	let siteName = "";
	let url = "";
	let description = "";
	let avatar = "";
	let submitting = false;
	let submitted = false;

	$: user = $blogAuth.user;
	$: isLoggedIn = !!user;

	onMount(() => {
		void blogAuth.refresh();
	});

	async function submit(): Promise<void> {
		const name = siteName.trim();
		const siteUrl = url.trim();
		if (!name) {
			emitErrorToast("提交失败", "请填写站点名称");
			return;
		}
		if (name.length > 40) {
			emitErrorToast("提交失败", "站点名称不能超过 40 个字符");
			return;
		}
		if (!/^https?:\/\//i.test(siteUrl)) {
			emitErrorToast("提交失败", "请填写以 http/https 开头的网站链接");
			return;
		}
		if (description.trim().length > 200) {
			emitErrorToast("提交失败", "简介不能超过 200 个字符");
			return;
		}
		submitting = true;
		try {
			await friendsApi.apply({
				siteName: name,
				url: siteUrl,
				description: description.trim(),
				avatar: avatar.trim(),
			});
			submitted = true;
			emitSuccessToast("已提交", "申请已提交，审核通过后就会显示在友链中");
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

{#if submitted}
	<div class="rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/10 px-5 py-4 text-sm text-[var(--primary)]">
		申请已提交 ✅ 管理员审核通过后，你的站点就会出现在友链列表中。
	</div>
{:else if !isLoggedIn}
	<div class="flex flex-col items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] px-6 py-10 text-center">
		<p class="text-sm text-[var(--muted-foreground)]">登录后即可提交友链申请</p>
		<a
			href="/auth/login/?redirect=/friends/"
			class="rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[var(--primary-foreground)]"
			>去登录</a
		>
	</div>
{:else}
	<form
		class="flex flex-col gap-3"
		on:submit|preventDefault={submit}
	>
		<input
			bind:value={siteName}
			placeholder="站点名称（必填）"
			maxlength="40"
			class="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-sm outline-none focus:border-[var(--primary)]"
		/>
		<input
			bind:value={url}
			placeholder="网站链接，如 https://example.com（必填）"
			maxlength="300"
			class="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-sm outline-none focus:border-[var(--primary)]"
		/>
		<textarea
			bind:value={description}
			placeholder="一句话简介（可选，最多 200 字）"
			maxlength="200"
			rows="3"
			class="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-sm outline-none focus:border-[var(--primary)]"
		></textarea>
		<input
			bind:value={avatar}
			placeholder="头像图片链接（可选，需 http/https）"
			maxlength="500"
			class="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-sm outline-none focus:border-[var(--primary)]"
		/>
		<button
			type="submit"
			disabled={submitting}
			class="mt-1 cursor-pointer rounded-xl bg-[var(--primary)] px-6 py-2.5 text-sm font-bold text-[var(--primary-foreground)] transition-opacity disabled:opacity-60"
			>{submitting ? "提交中..." : "提交申请"}</button
		>
		<p class="text-xs text-[var(--muted-foreground)]">
			提交即代表你的网站已满足下方申请要求；审核结果会通过站内通知告知。
		</p>
	</form>
{/if}
