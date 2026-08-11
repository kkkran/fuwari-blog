import { randomBytes } from "node:crypto";
import { config } from "./config.js";

interface GithubUser {
	id: string;
	login: string;
	name: string | null;
	email: string | null;
	avatar_url: string;
}

// state 防 CSRF：内存存储，10 分钟过期；同时携带回跳地址
const stateStore = new Map<string, { expiresAt: number; redirect: string }>();

export function generateOAuthState(redirect = "/"): string {
	const state = randomBytes(16).toString("hex");
	stateStore.set(state, { expiresAt: Date.now() + 10 * 60 * 1000, redirect });
	return state;
}

export function consumeOAuthState(
	state: string,
): { valid: boolean; redirect: string } {
	const entry = stateStore.get(state);
	stateStore.delete(state);
	if (!entry) return { valid: false, redirect: "/" };
	return {
		valid: entry.expiresAt > Date.now(),
		redirect: entry.redirect,
	};
}

export function buildAuthorizeUrl(state: string): string {
	const params = new URLSearchParams({
		client_id: config.github.clientId,
		redirect_uri: config.github.redirectUri,
		scope: "read:user user:email",
		state,
	});
	return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

async function exchangeCode(code: string): Promise<string> {
	const response = await fetch("https://github.com/login/oauth/access_token", {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			client_id: config.github.clientId,
			client_secret: config.github.clientSecret,
			code,
			redirect_uri: config.github.redirectUri,
		}),
	});
	if (!response.ok) {
		throw new Error(`GitHub token exchange failed: ${response.status}`);
	}
	const data = (await response.json()) as { access_token?: string; error?: string };
	if (!data.access_token) {
		throw new Error(`GitHub token exchange error: ${data.error ?? "unknown"}`);
	}
	return data.access_token;
}

async function fetchGithubUser(accessToken: string): Promise<GithubUser> {
	const response = await fetch("https://api.github.com/user", {
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${accessToken}`,
			"User-Agent": "fuwari-blog-server",
		},
	});
	if (!response.ok) {
		throw new Error(`GitHub user fetch failed: ${response.status}`);
	}
	const data = (await response.json()) as {
		id: number;
		login: string;
		name: string | null;
		email: string | null;
		avatar_url: string;
	};
	return {
		id: String(data.id),
		login: data.login,
		name: data.name,
		email: data.email,
		avatar_url: data.avatar_url,
	};
}

/** 用 code 换取 GitHub 用户信息（含 access token 交换） */
export async function authenticateWithGithub(code: string): Promise<GithubUser> {
	const accessToken = await exchangeCode(code);
	return fetchGithubUser(accessToken);
}
