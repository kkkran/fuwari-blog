import { randomUUID } from "node:crypto";
import { db } from "./db.js";
import { config } from "./config.js";
import type { User, UserRole } from "./types.js";

interface UserRow {
	id: number;
	email: string | null;
	password_hash: string | null;
	display_name: string;
	avatar_url: string;
	github_id: string | null;
	role: UserRole;
	created_at: string;
}

function toUser(row: UserRow): User {
	return {
		id: row.id,
		email: row.email,
		displayName: row.display_name,
		avatarUrl: row.avatar_url,
		githubId: row.github_id,
		role: row.role,
		createdAt: row.created_at,
	};
}

export function getUserById(id: number): User | null {
	const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
		| UserRow
		| undefined;
	return row ? toUser(row) : null;
}

export function getUserByEmail(email: string): User | null {
	const row = db
		.prepare("SELECT * FROM users WHERE lower(email) = ?")
		.get(email.toLowerCase()) as UserRow | undefined;
	return row ? toUser(row) : null;
}

export function getUserByGithubId(githubId: string): User | null {
	const row = db
		.prepare("SELECT * FROM users WHERE github_id = ?")
		.get(githubId) as UserRow | undefined;
	return row ? toUser(row) : null;
}

/** 校验邮箱+密码，成功返回用户，失败返回 null */
export function verifyUserPassword(
	email: string,
	password: string,
	bcryptCompare: (hash: string, plain: string) => boolean,
): User | null {
	const row = db
		.prepare("SELECT * FROM users WHERE lower(email) = ?")
		.get(email.toLowerCase()) as UserRow | undefined;
	if (!row || !row.password_hash) return null;
	if (!bcryptCompare(row.password_hash, password)) return null;
	return toUser(row);
}

export function createUser(input: {
	email?: string;
	passwordHash?: string;
	displayName: string;
	avatarUrl?: string;
	githubId?: string;
}): User {
	const role: UserRole = config.adminEmails.includes(input.email ?? "")
		? "admin"
		: "user";
	const result = db
		.prepare(
			`INSERT INTO users (email, password_hash, display_name, avatar_url, github_id, role)
       VALUES (?, ?, ?, ?, ?, ?)`,
		)
		.run(
			input.email ?? null,
			input.passwordHash ?? null,
			input.displayName,
			input.avatarUrl ?? "",
			input.githubId ?? null,
			role,
		);
	return getUserById(Number(result.lastInsertRowid))!;
}

export function updateUserGithub(
	userId: number,
	input: {
		githubId: string;
		displayName: string;
		avatarUrl: string;
		email?: string | null;
	},
): User {
	const current = getUserById(userId)!;
	const role: UserRole = config.adminEmails.includes(input.email ?? "")
		? "admin"
		: current.role;
	db.prepare(
		`UPDATE users
     SET github_id = ?, display_name = ?, avatar_url = ?, email = COALESCE(?, email), role = ?
     WHERE id = ?`,
	).run(
		input.githubId,
		input.displayName,
		input.avatarUrl,
		input.email ?? null,
		role,
		userId,
	);
	return getUserById(userId)!;
}

// ---------- sessions ----------

export function createSession(userId: number): string {
	const token = randomUUID();
	const expiresAt = new Date(
		Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000,
	).toISOString();
	db.prepare(
		"INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
	).run(token, userId, expiresAt);
	return token;
}

export function getSessionUser(token: string): User | null {
	// expires_at 历史上存 ISO 8601（如 2026-09-10T10:33:05.410Z），
	// 与 datetime('now')（2026-08-11 18:33:05）直接字符串比较在同日内会失效，
	// 统一用 julianday() 解析为时间戳比较
	db.prepare(
		"DELETE FROM sessions WHERE julianday(expires_at) < julianday('now')",
	).run();
	const row = db
		.prepare(
			`SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND julianday(s.expires_at) > julianday('now')`,
		)
		.get(token) as UserRow | undefined;
	return row ? toUser(row) : null;
}

export function deleteSession(token: string): void {
	db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}
