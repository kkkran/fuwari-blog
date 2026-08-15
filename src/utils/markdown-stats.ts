/**
 * Markdown 正文字数统计。
 *
 * 口径：剥离 markdown 语法后——
 * - 中文（含中文标点）逐字符计数；
 * - 英文/数字按单词计数（连字符词视为一词，如 well-known）。
 *
 * 用于编辑器底部的"正文约 X 字"状态栏。
 */
export function countMarkdownWords(md: string): number {
	const plain = md
		// 代码块（含围栏）整体剔除
		.replace(/```[\s\S]*?```/g, " ")
		// 行内代码剔除
		.replace(/`[^`]*`/g, " ")
		// 图片语法整体剔除（alt 文本不算正文）
		.replace(/!\[[^\]]*]\([^)]*\)/g, " ")
		// 链接仅保留文字部分
		.replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
		// 标题/引用/强调/删除线等标记符替换为空白
		.replace(/[#>*_~|]/g, " ")
		// 行首列表符（- 或 数字.）剥离，避免把列表符号计成内容
		.replace(/^\s*[-+]\s+/gm, " ")
		.replace(/^\s*\d+\.\s+/gm, " ");

	// 中文与中文标点逐字符
	const cjk = (plain.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) ?? []).length;
	// 英文/数字按词（先把中文字符替换为空白，避免粘连计数）
	const latin = plain.replace(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g, " ");
	const words = (latin.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g) ?? []).length;

	return cjk + words;
}
