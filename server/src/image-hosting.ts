/**
 * 图床客户端：对接 oneimg（智谱系自建图床）的登录与上传。
 *
 * 设计要点：
 * - 会话 cookie 进程内缓存，首次上传时登录，后续复用；
 * - 任何失败（配置缺失/网络异常/业务错误）都返回 null，
 *   由调用方决定回退本地存储，不向上抛错。
 */
import { config } from "./config.js";

export interface ImageHostingResult {
	/** 图床可访问的绝对 URL */
	url: string;
	/** 图床侧图片 id */
	id?: number;
}

export interface UploadableFile {
	originalname: string;
	mimetype: string;
	buffer: Buffer;
}

const LOGIN_PATH = "/api/login";
const UPLOAD_PATH = "/api/upload";

let sessionCookie: string | null = null;

/** 仅测试用：重置已缓存的会话，模拟全新进程 */
export function resetImageHostingSession(): void {
	sessionCookie = null;
}

function extractSessionCookie(response: Response): string | null {
	const setCookie = response.headers.getSetCookie?.() ?? [];
	for (const header of setCookie) {
		const pair = header.split(";")[0];
		if (pair.startsWith("oneimg-session=")) {
			return pair;
		}
	}
	return null;
}

async function login(fetchImpl: typeof fetch): Promise<boolean> {
	const { baseUrl, username, password } = config.imageHosting;
	try {
		const response = await fetchImpl(`${baseUrl}${LOGIN_PATH}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ username, password }),
		});
		if (!response.ok) {
			return false;
		}
		const data = (await response.json()) as {
			code?: number;
			data?: { token?: string };
		};
		if (data.code !== 200 || !data.data?.token) {
			return false;
		}
		const cookie = extractSessionCookie(response);
		if (!cookie) {
			return false;
		}
		sessionCookie = cookie;
		return true;
	} catch {
		return false;
	}
}

/**
 * 将单个图片上传到 oneimg 图床。
 * 返回图床绝对 URL；任何失败均返回 null（由调用方回退本地存储）。
 */
export async function uploadToImageHosting(
	file: UploadableFile,
	fetchImpl: typeof fetch = fetch,
): Promise<ImageHostingResult | null> {
	const { enabled, baseUrl } = config.imageHosting;
	if (!enabled || !baseUrl) {
		return null;
	}

	if (!sessionCookie && !(await login(fetchImpl))) {
		return null;
	}

	try {
		const form = new FormData();
		form.append(
			"images[]",
			new Blob([file.buffer], { type: file.mimetype }),
			file.originalname,
		);
		const response = await fetchImpl(`${baseUrl}${UPLOAD_PATH}`, {
			method: "POST",
			headers: { Cookie: sessionCookie as string },
			body: form,
		});
		if (!response.ok) {
			return null;
		}
		const data = (await response.json()) as {
			code?: number;
			data?: { files?: Array<{ url?: string; id?: number }> };
		};
		const fileEntry = data.data?.files?.[0];
		if (data.code !== 200 || !fileEntry?.url) {
			return null;
		}
		return {
			url: fileEntry.url.startsWith("http") ? fileEntry.url : `${baseUrl}${fileEntry.url}`,
			id: fileEntry.id,
		};
	} catch {
		return null;
	}
}
