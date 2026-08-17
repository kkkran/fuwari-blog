/**
 * 全局加载中状态（引用计数）。
 *
 * 耗时操作（AI 生成/图片上传等）调用 startLoading()，完成后必须 stopLoading()；
 * 多个并发操作共享一个弹窗，全部完成后才关闭。
 */
import { writable, type Writable } from "svelte/store";

export interface LoadingState {
	active: boolean;
	message: string;
}

export const loadingState: Writable<LoadingState> = writable<LoadingState>({
	active: false,
	message: "",
});

let counter = 0;

export function startLoading(message = "正在操作，请耐心等待"): void {
	counter++;
	loadingState.set({ active: true, message });
}
export function stopLoading(): void {
	counter = Math.max(0, counter - 1);
	if (counter === 0) {
		loadingState.set({ active: false, message: "" });
	}
}
