/**
 * IndexNow 工具函数（纯逻辑，供 indexnow-ping.js 使用）。
 * IndexNow 协议：https://www.indexnow.org/
 * key 文件需放在站点根目录：/<key>.txt（内容为 key 本身）。
 */

const KEY_RE = /^[0-9a-f]{32}$/;

/** 规范化 key：去除首尾空白，必须是 32 位 hex（IndexNow 规范） */
export function normalizeKey(rawKey) {
	const key = String(rawKey ?? "").trim();
	if (!KEY_RE.test(key)) {
		throw new Error(`IndexNow key 非法（需 32 位十六进制）：${key}`);
	}
	return key;
}

/** 从文章文件路径提取 slug；非文章路径返回 null */
export function extractSlugFromPath(filePath) {
	const m = String(filePath).match(/^src\/content\/posts\/(.+)\.md$/);
	if (!m) return null;
	// 兼容子目录：取文件名（去扩展名），slug 即文件名
	return m[1].split("/").pop();
}

/** 从 git 变更文件列表收集文章 URL（新增/修改均触发） */
export function collectPostUrlsFromGit(files, siteUrl) {
	const urls = [];
	for (const file of files) {
		const slug = extractSlugFromPath(file);
		if (slug) {
			urls.push(`${siteUrl.replace(/\/$/, "")}/posts/${encodeURIComponent(slug)}/`);
		}
	}
	return urls;
}

/** 构造 IndexNow POST 请求体 */
export function toIndexNowPayload({ host, key, urls }) {
	return {
		host,
		key,
		keyLocation: `https://${host}/${key}.txt`,
		urlList: urls,
	};
}
