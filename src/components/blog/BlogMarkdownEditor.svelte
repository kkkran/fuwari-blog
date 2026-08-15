<script lang="ts">
	import { BlogApiError, uploadApi } from "@/blog/api";
	import {
		POST_IMAGE_MAX_BYTES,
		compressPostImage,
		isPostImageWithinLimit,
	} from "@/forum/utils/image-compression";
	import type Editor from "@toast-ui/editor";
	import { createEventDispatcher, onDestroy, onMount } from "svelte";

	const toolbarMap: string[][] = [
		["heading", "bold", "italic", "strike"],
		["hr", "quote"],
		["ul", "ol", "task"],
		["table", "link", "image"],
		["code", "codeblock"],
	];

	const MAX_UPLOAD_SIZE_LABEL = `${Math.round(POST_IMAGE_MAX_BYTES / 1024)}KB`;

	export let value = "";
	export let placeholder = "支持 Markdown，Ctrl/Cmd + Enter 提交";
	export let disabled = false;
	export let submitting = false;
	export let submitHint = "Ctrl/Cmd + Enter 提交";
	export let minHeight = 360;
	export let shellClass = "";
	export let autoFocus = false;

	const dispatch = createEventDispatcher<{
		submit: void;
		escape: void;
		change: { value: string };
	}>();

	let containerEl: HTMLDivElement;
	let editor: Editor | null = null;
	let internalValue = value;
	let keydownCleanup: (() => void) | null = null;
	let uploadStatus = "";
	let uploading = false;

	function syncValue(nextValue: string) {
		internalValue = nextValue;
		if (value !== nextValue) {
			value = nextValue;
			dispatch("change", { value: nextValue });
		}
	}

	async function updatePreviewClasses() {
		const previewEl = containerEl?.querySelector(".toastui-editor-contents");
		if (!previewEl) return;
		previewEl.classList.add(
			"custom-md",
			"prose",
			"prose-invert",
			"!max-w-none",
			"break-words",
			"text-white/75",
		);

		// 导入并应用代码高亮
		const { highlightAllCodeBlocks } = await import("@/utils/code-highlight");
		highlightAllCodeBlocks();
	}

	function setDisabledState(nextDisabled: boolean) {
		const root = containerEl?.querySelector(".toastui-editor-defaultUI");
		root?.classList.toggle("is-disabled", nextDisabled);
		if (editor && typeof editor.setDisabled === "function") {
			editor.setDisabled(nextDisabled);
		}
	}

	function normalizeUploadError(error: unknown) {
		if (error instanceof BlogApiError && error.status === 401) {
			return "请先登录后再上传图片。";
		}
		if (error instanceof Error && error.message) {
			return error.message;
		}
		return "图片上传失败，请稍后重试。";
	}

	async function handleImageUpload(
		blob: Blob | File,
		callback: (url: string, text?: string) => void,
	) {
		if (!(blob instanceof File)) {
			uploadStatus = "仅支持上传图片文件。";
			return;
		}

		if (!blob.type.startsWith("image/")) {
			uploadStatus = "仅支持上传图片文件。";
			return;
		}

		uploading = true;
		uploadStatus = "正在压缩图片...";

		let uploadFileTarget = blob;

		try {
			try {
				uploadFileTarget = await compressPostImage(blob);
			} catch (error) {
				if (!isPostImageWithinLimit(blob)) {
					throw new Error(
						`图片压缩失败，且原图仍超过 ${MAX_UPLOAD_SIZE_LABEL} 限制。`,
					);
				}
				uploadFileTarget = blob;
			}

			if (!isPostImageWithinLimit(uploadFileTarget)) {
				uploadStatus = `压缩后图片仍超过 ${MAX_UPLOAD_SIZE_LABEL}，请更换更小的图片。`;
				return;
			}

			uploadStatus =
				uploadFileTarget === blob ? "正在上传图片..." : "正在上传压缩后的图片...";
			const url = await uploadApi.uploadImage(uploadFileTarget);
			if (!url) {
				throw new Error("上传成功，但未获取到图片地址。");
			}
			callback(url, uploadFileTarget.name || blob.name || "image");
			uploadStatus = "图片已上传并插入。";
			syncValue(editor?.getMarkdown() || "");
		} catch (error) {
			uploadStatus = normalizeUploadError(error);
		} finally {
			uploading = false;
		}
	}

	onMount(() => {
		let disposed = false;

		void (async () => {
			const { default: Editor } = await import("@toast-ui/editor");
			if (disposed) {
				return;
			}

			editor = new Editor({
				el: containerEl,
				height: `${minHeight}px`,
				autofocus: autoFocus,
				initialEditType: "markdown",
				previewStyle: "vertical",
				initialValue: value,
				placeholder,
				theme: "dark",
				usageStatistics: false,
				hideModeSwitch: true,
				toolbarItems: toolbarMap,
				useCommandShortcut: true,
				hooks: {
					addImageBlobHook: async (
						blob: Blob | File,
						callback: (url: string, text?: string) => void,
					) => {
						await handleImageUpload(blob, callback);
						return false;
					},
				},
			});

			editor.on("change", () => {
				syncValue(editor?.getMarkdown() || "");
				void updatePreviewClasses();
			});

			const keydownHandler = (event: KeyboardEvent) => {
				if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
					event.preventDefault();
					dispatch("submit");
					return;
				}

				if (event.key === "Escape") {
					dispatch("escape");
				}
			};

			containerEl.addEventListener("keydown", keydownHandler);
			keydownCleanup = () =>
				containerEl.removeEventListener("keydown", keydownHandler);

			await updatePreviewClasses();
			setDisabledState(disabled || submitting);
		})();

		return () => {
			disposed = true;
		};
	});

	onDestroy(() => {
		keydownCleanup?.();
		keydownCleanup = null;
		editor?.destroy();
		editor = null;
	});

	$: if (editor && value !== internalValue) {
		internalValue = value;
		editor.setMarkdown(value, false);
		void updatePreviewClasses();
	}

	$: if (editor && placeholder) {
		editor.setPlaceholder(placeholder);
	}

	$: if (editor) {
		setDisabledState(disabled || submitting);
	}
</script>

<div class={`blog-editor-shell ${shellClass}`.trim()}>
	<div bind:this={containerEl} />
	{#if uploadStatus}
		<p
			class:list={[
				"mt-2 flex items-center gap-1.5 text-xs",
				uploading ? "text-white/45" : "text-white/55",
			]}
		>
			{#if uploading}
				<span
					class="inline-block size-3 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-white/60"
					aria-hidden="true"
				/>
			{/if}
			{uploadStatus}
		</p>
	{/if}
</div>

<style>
	:global(.blog-editor-shell .toastui-editor-defaultUI) {
		zoom: 0.8;
		border-radius: 1rem;
		overflow: hidden;
		border: 1px solid rgb(255 255 255 / 0.1);
		background: rgb(255 255 255 / 0.04);
	}

	:global(.blog-editor-shell .toastui-editor-toolbar) {
		background: rgb(255 255 255 / 0.03);
		border-bottom: 1px solid rgb(255 255 255 / 0.08);
	}

	:global(.blog-editor-shell .toastui-editor-toolbar-icons) {
		border-radius: 0.75rem;
		opacity: 0.9;
	}

	:global(.blog-editor-shell .toastui-editor-main) {
		background: rgb(10 12 18 / 0.36);
	}

	:global(.blog-editor-shell .toastui-editor-md-container),
	:global(.blog-editor-shell .toastui-editor-ww-container),
	:global(.blog-editor-shell .toastui-editor-md-preview) {
		background: rgb(7 10 15 / 0.32);
	}

	:global(.blog-editor-shell .toastui-editor-md-preview) {
		border-left: 1px solid rgb(255 255 255 / 0.08);
	}

	:global(.blog-editor-shell .toastui-editor-md-tab-container) {
		display: none;
	}

	:global(.blog-editor-shell .toastui-editor-contents) {
		font-family: inherit;
		color: rgb(255 255 255 / 0.78);
	}

	:global(.blog-editor-shell .toastui-editor-md-preview .toastui-editor-contents),
	:global(.blog-editor-shell .toastui-editor-md-container .toastui-editor-contents) {
		padding: 1rem 1.25rem;
	}

	:global(.blog-editor-shell .toastui-editor-main-container) {
		min-height: inherit;
	}

	:global(.blog-editor-shell .toastui-editor-md-preview .toastui-editor-contents h1),
	:global(.blog-editor-shell .toastui-editor-md-preview .toastui-editor-contents h2),
	:global(.blog-editor-shell .toastui-editor-md-preview .toastui-editor-contents h3),
	:global(.blog-editor-shell .toastui-editor-md-preview .toastui-editor-contents h4),
	:global(.blog-editor-shell .toastui-editor-md-preview .toastui-editor-contents h5),
	:global(.blog-editor-shell .toastui-editor-md-preview .toastui-editor-contents h6) {
		color: white;
	}

	:global(.blog-editor-shell .toastui-editor-defaultUI.is-disabled) {
		opacity: 0.65;
	}
</style>
