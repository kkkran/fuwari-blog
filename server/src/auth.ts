import { Router } from "express";
import bcrypt from "bcryptjs";
import { config, githubOAuthEnabled } from "./config.js";
import {
	authenticateWithGithub,
	buildAuthorizeUrl,
	consumeOAuthState,
	generateOAuthState,
} from "./github.js";
import { getSessionToken, requireAuth } from "./middleware.js";
import {
	createSession,
	createUser,
	deleteSession,
	getSessionUser,
	getUserByEmail,
	getUserByGithubId,
	updateUserGithub,
	verifyUserPassword,
} from "./users.js";

export const authRouter = Router();

function setSessionCookie(res: import("express").Response, token: string): void {
	res.cookie(config.sessionCookieName, token, {
		httpOnly: true,
		sameSite: config.cookieSameSite,
		secure: config.cookieSecure,
		maxAge: config.sessionTtlDays * 24 * 60 * 60 * 1000,
		path: "/",
	});
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeRedirect(raw: unknown): string {
	if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) {
		return "/";
	}
	return raw;
}

// ---------- 注册 ----------

authRouter.post("/register", (req, res) => {
	const { email, password, displayName } = (req.body ?? {}) as Record<
		string,
		unknown
	>;
	if (typeof email !== "string" || !EMAIL_RE.test(email)) {
		res.status(400).json({ error: "邮箱格式不正确" });
		return;
	}
	if (typeof password !== "string" || password.length < 8) {
		res.status(400).json({ error: "密码至少需要 8 位" });
		return;
	}
	const name =
		typeof displayName === "string" && displayName.trim()
			? displayName.trim().slice(0, 40)
			: email.split("@")[0];
	if (getUserByEmail(email)) {
		res.status(409).json({ error: "该邮箱已注册" });
		return;
	}
	const passwordHash = bcrypt.hashSync(password, 10);
	const user = createUser({ email, passwordHash, displayName: name });
	const token = createSession(user.id);
	setSessionCookie(res, token);
	res.status(201).json({ user });
});

// ---------- 登录 ----------

authRouter.post("/login", (req, res) => {
	const { email, password } = (req.body ?? {}) as Record<string, unknown>;
	if (typeof email !== "string" || typeof password !== "string") {
		res.status(400).json({ error: "邮箱和密码不能为空" });
		return;
	}
	const user = verifyUserPassword(email, password, (hash, plain) =>
		bcrypt.compareSync(plain, hash),
	);
	if (!user) {
		res.status(401).json({ error: "邮箱或密码错误" });
		return;
	}
	const token = createSession(user.id);
	setSessionCookie(res, token);
	res.json({ user });
});

// ---------- 登出 ----------

authRouter.post("/logout", (req, res) => {
	const token = getSessionToken(req);
	if (token) {
		deleteSession(token);
	}
	res.clearCookie(config.sessionCookieName, { path: "/" });
	res.json({ ok: true });
});

// ---------- 当前会话 ----------

authRouter.get("/session", (req, res) => {
	const token = getSessionToken(req);
	const user = token ? getSessionUser(token) : null;
	if (!user) {
		res.json({ user: null });
		return;
	}
	res.json({ user });
});

// ---------- GitHub OAuth ----------

authRouter.get("/github", (req, res) => {
	if (!githubOAuthEnabled()) {
		res.status(503).json({ error: "GitHub 登录未配置" });
		return;
	}
	const redirect = normalizeRedirect(req.query.redirect);
	const state = generateOAuthState(redirect);
	res.redirect(buildAuthorizeUrl(state));
});

authRouter.get("/github/callback", async (req, res) => {
	try {
		if (!githubOAuthEnabled()) {
			res.status(503).json({ error: "GitHub 登录未配置" });
			return;
		}
		const code = typeof req.query.code === "string" ? req.query.code : "";
		const state = typeof req.query.state === "string" ? req.query.state : "";
		if (!code || !state) {
			res.redirect(`${config.frontendBaseUrl}/auth/login/?error=oauth_failed`);
			return;
		}
		const { valid, redirect } = consumeOAuthState(state);
		if (!valid) {
			res.redirect(`${config.frontendBaseUrl}/auth/login/?error=oauth_state`);
			return;
		}
		const ghUser = await authenticateWithGithub(code);
		const email = ghUser.email && EMAIL_RE.test(ghUser.email) ? ghUser.email : null;
		const displayName = ghUser.name?.trim() || ghUser.login;

		// 已绑定 GitHub → 直接登录；邮箱已注册 → 绑定；否则新注册
		let user = getUserByGithubId(ghUser.id);
		if (!user) {
			const byEmail = email ? getUserByEmail(email) : null;
			if (byEmail) {
				user = byEmail;
			} else {
				user = createUser({
					email: email ?? undefined,
					displayName,
					avatarUrl: ghUser.avatar_url,
					githubId: ghUser.id,
				});
			}
		}
		user = updateUserGithub(user.id, {
			githubId: ghUser.id,
			displayName,
			avatarUrl: ghUser.avatar_url,
			email,
		});

		const token = createSession(user.id);
		setSessionCookie(res, token);
		res.redirect(`${config.frontendBaseUrl}${redirect}`);
	} catch (error) {
		console.error("[github oauth]", error);
		res.redirect(`${config.frontendBaseUrl}/auth/login/?error=oauth_failed`);
	}
});

// 供导航栏判断是否展示 GitHub 登录按钮
authRouter.get("/providers", (_req, res) => {
	res.json({ github: githubOAuthEnabled() });
});

// 供调试/测试：获取当前登录用户
authRouter.get("/me", requireAuth, (req, res) => {
	res.json({ user: req.user });
});
