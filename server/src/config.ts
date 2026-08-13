import "dotenv/config";

function parseList(value: string | undefined): string[] {
	return (value ?? "")
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

export const config = {
	port: Number(process.env.PORT ?? 3001),
	sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "fuwari_session",
	sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 30),
	// 生产跨域（前端 https://x 与 API https://api.x 非同站）需 COOKIE_SAME_SITE=none 且 COOKIE_SECURE=true
	cookieSameSite: (process.env.COOKIE_SAME_SITE === "none" ? "none" : "lax") as
		| "lax"
		| "none",
	cookieSecure: process.env.COOKIE_SECURE === "true",
	adminEmails: parseList(process.env.ADMIN_EMAILS),
	github: {
		clientId: process.env.GITHUB_CLIENT_ID ?? "",
		clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
		redirectUri:
			process.env.GITHUB_REDIRECT_URI ??
			"http://127.0.0.1:3001/api/auth/github/callback",
	},
	frontendBaseUrl: process.env.FRONTEND_BASE_URL ?? "http://127.0.0.1:4321",
	corsOrigins: parseList(
		process.env.CORS_ORIGIN ?? "http://127.0.0.1:4321,http://localhost:4321",
	),
	databasePath: process.env.DATABASE_PATH ?? "./data/fuwari.db",
	// oneimg 图床：启用后新上传的图片转发图床，失败回退本地存储
	imageHosting: {
		enabled: process.env.IMAGE_HOSTING_ENABLED === "true",
		baseUrl: (process.env.IMAGE_HOSTING_BASE_URL ?? "").replace(/\/+$/, ""),
		username: process.env.IMAGE_HOSTING_USERNAME ?? "",
		password: process.env.IMAGE_HOSTING_PASSWORD ?? "",
	},
};

export function githubOAuthEnabled(): boolean {
	return Boolean(config.github.clientId && config.github.clientSecret);
}
