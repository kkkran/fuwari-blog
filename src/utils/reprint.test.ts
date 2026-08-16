import { describe, expect, it } from "vitest";
import { buildReprintMarkdown } from "./reprint";

const md = "# 标题\n\n正文第一段\n\n```js\nconst a = 1;\n```";

describe("buildReprintMarkdown", () => {
	it("包含标题、正文、原文链接与版权声明", () => {
		const text = buildReprintMarkdown({
			title: "我的文章",
			url: "https://miscoke.top/posts/my-post/",
			content: md,
		});
		expect(text).toContain("# 我的文章");
		expect(text).toContain("正文第一段");
		expect(text).toContain("```js");
		expect(text).toContain("原文链接：https://miscoke.top/posts/my-post/");
		expect(text).toContain("CC BY-NC-SA 4.0");
	});

	it("原文链接位于正文之后（声明在底部）", () => {
		const text = buildReprintMarkdown({
			title: "标题",
			url: "https://miscoke.top/posts/a/",
			content: "正文内容",
		});
		const bodyIdx = text.indexOf("正文内容");
		const linkIdx = text.indexOf("原文链接");
		expect(linkIdx).toBeGreaterThan(bodyIdx);
	});
});
