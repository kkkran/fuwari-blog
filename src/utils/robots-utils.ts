/**
 * robots.txt 生成：精确禁用隐私/后台路径，其余内容全部放行。
 * 注意：/blog/ 放行而 /blog/admin 等后台禁用——robots 规则按最长前缀匹配，
 * 后台路径长度更长，Disallow 优先于 Allow，行为正确。
 */
export function buildRobotsTxt(siteUrl: string): string {
	const disallowPaths = [
		"/_astro/",
		"/api/",
		"/auth/",
		"/blog/admin",
		"/blog/manage",
		"/blog/new",
		"/forum/",
	];

	const lines = [
		"User-agent: *",
		...disallowPaths.map((p) => `Disallow: ${p}`),
		"",
		"Allow: /posts/",
		"Allow: /blog/",
		"",
		`Sitemap: ${new URL("sitemap.xml", siteUrl).href}`,
	];

	return lines.join("\n");
}
