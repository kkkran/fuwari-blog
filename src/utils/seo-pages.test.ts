import { describe, expect, it } from "vitest";
import { getStaticSitemapPages } from "./sitemap-utils";
import { buildRobotsTxt } from "./robots-utils";

describe("sitemap 静态页面清单", () => {
	it("包含真实存在的页面路径", () => {
		const urls = getStaticSitemapPages().map((p) => p.url);
		expect(urls).toContain("/");
		expect(urls).toContain("/archive/");
		expect(urls).toContain("/friends/");
		expect(urls).toContain("/sponsors/");
		expect(urls).toContain("/blog/");
		expect(urls).toContain("/tools/gallery/");
		expect(urls).toContain("/bangumi/");
		expect(urls).toContain("/tools/");
	});

	it("不含已删除/不存在的页面（无死链）", () => {
		const urls = getStaticSitemapPages().map((p) => p.url);
		expect(urls).not.toContain("/gallery/");
		expect(urls).not.toContain("/changes/");
		expect(urls).not.toContain("/cover/");
	});

	it("每个页面都有合法的 priority 与 changefreq", () => {
		for (const page of getStaticSitemapPages()) {
			expect(page.priority).toBeGreaterThan(0);
			expect(page.priority).toBeLessThanOrEqual(1);
			expect(["daily", "weekly", "monthly", "yearly"]).toContain(page.changefreq);
		}
	});
});

describe("robots.txt 生成", () => {
	it("包含 Sitemap 引用", () => {
		const text = buildRobotsTxt("https://miscoke.top");
		expect(text).toContain("Sitemap: https://miscoke.top/sitemap.xml");
	});

	it("精确禁用隐私/后台路径", () => {
		const text = buildRobotsTxt("https://miscoke.top");
		expect(text).toContain("Disallow: /_astro/");
		expect(text).toContain("Disallow: /api/");
		expect(text).toContain("Disallow: /auth/");
		expect(text).toContain("Disallow: /blog/admin");
		expect(text).toContain("Disallow: /blog/manage");
		expect(text).toContain("Disallow: /blog/new");
		expect(text).toContain("Disallow: /forum/");
	});

	it("不再使用通配 /*/ 全禁策略", () => {
		const text = buildRobotsTxt("https://miscoke.top");
		expect(text).not.toContain("/*/");
	});

	it("文章与内容路径可被索引", () => {
		const text = buildRobotsTxt("https://miscoke.top");
		expect(text).toContain("Allow: /posts/");
		expect(text).toContain("Allow: /blog/");
	});
});
