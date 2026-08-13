/**
 * oneimg 图床客户端（上传脚本核心，与 server 侧 image-hosting 区分：
 * 脚本场景需要明确失败，因此错误一律抛出）。
 *
 * 用法见 scripts/upimg.js。
 */

export function loginToOneimg(
	{ baseUrl, username, password },
	fetchImpl = fetch,
) {
	return fetchImpl(`${baseUrl}/api/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ username, password }),
	}).then(async (response) => {
		if (!response.ok) {
			throw new Error(`图床登录请求失败（HTTP ${response.status}）`);
		}
		const data = await response.json();
		if (data.code !== 200 || !data.data?.token) {
			throw new Error(`图床登录失败：${data.message ?? "未知错误"}`);
		}
		const setCookie = response.headers.getSetCookie?.() ?? [];
		const cookie = setCookie
			.map((header) => header.split(";")[0])
			.find((pair) => pair.startsWith("oneimg-session="));
		if (!cookie) {
			throw new Error("图床登录响应缺少会话 cookie");
		}
		return cookie;
	});
}

export function uploadImageToOneimg(
	{ baseUrl, cookie },
	file,
	fetchImpl = fetch,
) {
	const form = new FormData();
	form.append(
		"images[]",
		new Blob([file.buffer], { type: file.mimetype }),
		file.name,
	);
	return fetchImpl(`${baseUrl}/api/upload`, {
		method: "POST",
		headers: { Cookie: cookie },
		body: form,
	}).then(async (response) => {
		if (!response.ok) {
			throw new Error(`图床上传请求失败（HTTP ${response.status}）`);
		}
		const data = await response.json();
		const entry = data.data?.files?.[0];
		if (data.code !== 200 || !entry?.url) {
			throw new Error(`图床上传失败：${data.message ?? "未知错误"}`);
		}
		return {
			url: entry.url.startsWith("http") ? entry.url : `${baseUrl}${entry.url}`,
			id: entry.id,
		};
	});
}

/** 将绝对 URL 组装为 Markdown 图片引用 */
export function toMarkdownImage(url) {
	return `![](${url})`;
}
