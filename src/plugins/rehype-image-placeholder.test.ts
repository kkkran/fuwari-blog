import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { describe, expect, it } from "vitest";
import rehypeImagePlaceholder from "./rehype-image-placeholder";

async function renderMarkdown(md: string): Promise<string> {
	const processor = await createMarkdownProcessor({
		syntaxHighlight: false,
		gfm: true,
		rehypePlugins: [rehypeImagePlaceholder],
	});
	const { code } = await processor.render(md);
	return code;
}

describe("rehype-image-placeholder", () => {
	it("给普通图片加懒加载与占位容器，保留 src/alt", async () => {
		const html = await renderMarkdown(
			"![风景图](https://img.miscoke.top/uploads/2026/08/a.webp)",
		);
		expect(html).toContain('class="img-skeleton"');
		expect(html).toContain('loading="lazy"');
		expect(html).toContain('decoding="async"');
		expect(html).toContain('src="https://img.miscoke.top/uploads/2026/08/a.webp"');
		expect(html).toContain('alt="风景图"');
		// img 应位于 wrapper 内部，且 wrapper 紧贴 img
		expect(html).toMatch(
			/<span class="img-skeleton"><img[^>]*alt="风景图"[^>]*><\/span>/,
		);
	});

	it("链接包裹的图片保持链接结构，img 仍被包装", async () => {
		const html = await renderMarkdown(
			"[![缩略](https://img.miscoke.top/t.webp)](https://example.com/full)",
		);
		expect(html).toContain('href="https://example.com/full"');
		expect(html).toContain('<span class="img-skeleton">');
		expect(html).toMatch(/<a[^>]*><span class="img-skeleton"><img[^>]*><\/span><\/a>/);
	});

	it("同一张图片不会被重复包装（幂等）", async () => {
		const processor = await createMarkdownProcessor({
			syntaxHighlight: false,
			gfm: true,
			rehypePlugins: [rehypeImagePlaceholder, rehypeImagePlaceholder],
		});
		const { code } = await processor.render("![](https://img.miscoke.top/x.png)");
		// 只出现一次 wrapper，且不出现嵌套 wrapper
		expect(code.match(/class="img-skeleton"/g)?.length).toBe(1);
		expect(code).not.toContain(
			'<span class="img-skeleton"><span class="img-skeleton">',
		);
	});

	it("代码块中的图片语法不被转换", async () => {
		const html = await renderMarkdown("```md\n![a](b.png)\n```");
		expect(html).not.toContain('class="img-skeleton"');
	});
});
