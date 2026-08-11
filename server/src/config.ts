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
		process.env.CORS_ORIGIN ?? "http://127.0.0.1:4321",
	),
	databasePath: process.env.DATABASE_PATH ?? "./data/fuwari.db",
};

export function githubOAuthEnabled(): boolean {
	return Boolean(config.github.clientId && config.github.clientSecret);
}
