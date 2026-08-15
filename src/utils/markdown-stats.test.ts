import { describe, expect, it } from "vitest";
import { countMarkdownWords } from "./markdown-stats";

describe("countMarkdownWords", () => {
	it("空字符串为 0", () => {
		expect(countMarkdownWords("")).toBe(0);
		expect(countMarkdownWords("   \n\t ")).toBe(0);
	});

	it("纯中文逐字计数", () => {
		expect(countMarkdownWords("你好世界")).toBe(4);
		expect(countMarkdownWords("今天天气不错，适合写文章。")).toBe(13);
	});

	it("英文按单词计数", () => {
		expect(countMarkdownWords("hello world")).toBe(2);
		expect(countMarkdownWords("Hello, World! This is a test.")).toBe(6);
	});

	it("中英混合计数（中文逐字 + 英文按词）", () => {
		expect(countMarkdownWords("你好 world 测试")).toBe(5);
		expect(countMarkdownWords("使用 Astro 构建静态站点")).toBe(9);
	});

	it("代码块与行内代码不计入", () => {
		expect(countMarkdownWords("正文\n```js\nconsole.log('hello')\n```\n结尾")).toBe(4);
		expect(countMarkdownWords("使用 `const x = 1` 定义变量")).toBe(6);
	});

	it("链接只计链接文字，图片不计入", () => {
		expect(countMarkdownWords("查看[官方文档](https://docs.example.com)")).toBe(6);
		expect(countMarkdownWords("![封面图](https://img.example.com/a.webp)")).toBe(0);
	});

	it("标题/列表/引用等标记符不计入", () => {
		expect(countMarkdownWords("# 一级标题")).toBe(4);
		expect(countMarkdownWords("- 列表项一\n- 列表项二")).toBe(8);
		expect(countMarkdownWords("> 引用内容")).toBe(4);
	});

	it("数字串按一个词计数", () => {
		expect(countMarkdownWords("价格 12345 元")).toBe(4);
	});
});
