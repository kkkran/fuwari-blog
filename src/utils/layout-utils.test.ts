import { describe, expect, it } from "vitest";
import { isNoSidebarRoute } from "./layout-utils";

describe("isNoSidebarRoute", () => {
	it("命中 /forum 前缀", () => {
		expect(isNoSidebarRoute("/forum/")).toBe(true);
		expect(isNoSidebarRoute("/forum/post")).toBe(true);
		expect(isNoSidebarRoute("/forum/me/")).toBe(true);
	});

	it("命中 /tools 前缀", () => {
		expect(isNoSidebarRoute("/tools/")).toBe(true);
		expect(isNoSidebarRoute("/tools/gallery/")).toBe(true);
		expect(isNoSidebarRoute("/tools/timetable/")).toBe(true);
	});

	it("命中 /bangumi 前缀", () => {
		expect(isNoSidebarRoute("/bangumi/")).toBe(true);
	});

	it("博客后台路由去侧栏（写文章/管理/审核）", () => {
		expect(isNoSidebarRoute("/blog/new/")).toBe(true);
		expect(isNoSidebarRoute("/blog/manage/")).toBe(true);
		expect(isNoSidebarRoute("/blog/admin/")).toBe(true);
	});

	it("博客前台列表页仍保留侧栏", () => {
		expect(isNoSidebarRoute("/blog/")).toBe(false);
		expect(isNoSidebarRoute("/blog/2/")).toBe(false);
	});

	it("不命中普通页面", () => {
		expect(isNoSidebarRoute("/")).toBe(false);
		expect(isNoSidebarRoute("/blog/")).toBe(false);
		expect(isNoSidebarRoute("/posts/some-slug/")).toBe(false);
		expect(isNoSidebarRoute("/friends/")).toBe(false);
	});

	it("避免相似前缀误伤", () => {
		expect(isNoSidebarRoute("/toolkit/")).toBe(false);
		expect(isNoSidebarRoute("/forum/../x")).toBe(true);
	});

	it("空路径返回 false", () => {
		expect(isNoSidebarRoute("")).toBe(false);
	});
});
