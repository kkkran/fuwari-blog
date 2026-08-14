/**
 * reveal-scheduler 单元测试（vitest）
 *
 * 覆盖：空图片立即完成、全部就绪才完成、超时兜底、只完成一次、
 * 可注入时钟（setTimer/clearTimer）。
 */
import { describe, expect, it } from "vitest";
import { createRevealScheduler } from "./reveal-scheduler";

function createFakeClock() {
	let now = 0;
	const timers = new Map<number, { fn: () => void; at: number }>();
	let nextId = 1;
	return {
		now,
		advance(ms: number) {
			now += ms;
			for (const [id, t] of [...timers]) {
				if (t.at <= now) {
					timers.delete(id);
					t.fn();
				}
			}
		},
		setTimer: (fn: () => void, ms: number) => {
			const id = nextId++;
			timers.set(id, { fn, at: now + ms });
			return id;
		},
		clearTimer: (id: unknown) => {
			timers.delete(id as number);
		},
	};
}

describe("createRevealScheduler", () => {
	it("没有图片时立即完成（reason: all-ready）", () => {
		const clock = createFakeClock();
		const events: string[] = [];
		const scheduler = createRevealScheduler(0, (reason) => events.push(reason), {
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer,
		});
		expect(events).toEqual(["all-ready"]);
	});

	it("全部图片就绪后才完成，且只触发一次", () => {
		const clock = createFakeClock();
		const events: string[] = [];
		const scheduler = createRevealScheduler(3, (reason) => events.push(reason), {
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer,
		});
		scheduler.markSettled();
		expect(events).toEqual([]);
		scheduler.markSettled();
		expect(events).toEqual([]);
		scheduler.markSettled();
		expect(events).toEqual(["all-ready"]);
		// 完成后再次 settle 不应重复触发
		scheduler.markSettled();
		expect(events).toEqual(["all-ready"]);
	});

	it("未全部就绪时由超时兜底完成（reason: timeout）", () => {
		const clock = createFakeClock();
		const events: string[] = [];
		const scheduler = createRevealScheduler(2, (reason) => events.push(reason), {
			timeoutMs: 8000,
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer,
		});
		scheduler.markSettled();
		clock.advance(7999);
		expect(events).toEqual([]);
		clock.advance(1);
		expect(events).toEqual(["timeout"]);
	});

	it("全部就绪后超时定时器被清除，不会二次触发", () => {
		const clock = createFakeClock();
		const events: string[] = [];
		const scheduler = createRevealScheduler(1, (reason) => events.push(reason), {
			timeoutMs: 8000,
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer,
		});
		scheduler.markSettled();
		expect(events).toEqual(["all-ready"]);
		clock.advance(10000);
		expect(events).toEqual(["all-ready"]);
	});

	it("total 为 0 时即使有超时也不会产生重复完成", () => {
		const clock = createFakeClock();
		const events: string[] = [];
		const scheduler = createRevealScheduler(0, (reason) => events.push(reason), {
			timeoutMs: 8000,
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer,
		});
		expect(events).toEqual(["all-ready"]);
		clock.advance(10000);
		expect(events).toEqual(["all-ready"]);
	});
});
