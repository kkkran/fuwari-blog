/**
 * 一键转载：生成带原文链接与版权声明的 Markdown 文本，
 * 供投稿知乎/掘金等平台时直接复制使用。
 */
export function buildReprintMarkdown({
	title,
	url,
	content,
}: {
	title: string;
	url: string;
	content: string;
}): string {
	const body = content.trim();
	const declaration = [
		"---",
		`> 原文链接：${url}`,
		"> 转载自「世界树栈」，版权遵循 CC BY-NC-SA 4.0",
	].join("\n");

	return `# ${title}\n\n${body}\n\n${declaration}`;
}
