/**
 * 列表展示调度器：等待所有元素（如图片）就绪，全部完成或超时后统一触发展示。
 *
 * 纯逻辑模块，不依赖 DOM，时钟可注入以便测试：
 * - 图片总数为 0 时立即完成；
 * - 每张图片就绪调用 markSettled()，全部就绪即完成；
 * - 未全部就绪时由 timeoutMs 兜底完成；
 * - 完成只触发一次，完成后清理超时定时器；
 * - 展示时长完全跟随实际加载速度，不设固定下限。
 */

export type RevealReason = "all-ready" | "timeout";

export interface RevealSchedulerOptions {
	timeoutMs?: number;
	setTimer?: (fn: () => void, ms: number) => unknown;
	clearTimer?: (timer: unknown) => void;
}

export interface RevealScheduler {
	/** 标记一张图片就绪（load/error 都算） */
	markSettled: () => void;
}

export function createRevealScheduler(
	total: number,
	onComplete: (reason: RevealReason) => void,
	options: RevealSchedulerOptions = {},
): RevealScheduler {
	const { timeoutMs = 8000, setTimer = setTimeout } = options;
	// 默认 clearTimeout 参数类型与注入的 unknown 签名不兼容，这里统一包装
	const clearTimer: (timer: unknown) => void =
		options.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));

	let pending = total;
	let settled = false;
	let timer: unknown = null;

	const finish = (reason: RevealReason) => {
		if (settled) return;
		settled = true;
		if (timer !== null) {
			clearTimer(timer);
			timer = null;
		}
		onComplete(reason);
	};

	if (pending <= 0) {
		finish("all-ready");
		return { markSettled: () => undefined };
	}

	timer = setTimer(() => finish("timeout"), timeoutMs);

	return {
		markSettled: () => {
			if (settled || pending <= 0) return;
			pending -= 1;
			if (pending <= 0) {
				finish("all-ready");
			}
		},
	};
}
