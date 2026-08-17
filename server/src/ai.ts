import { Router } from "express";
import type { Request as ExpressRequest } from "express";
import { db } from "./db.js";
import { config, zhipuEnabled } from "./config.js";
import { requireAuth } from "./middleware.js";
import { createRateLimiter } from "./rate-limit.js";
import { toPublicImageUrl, uploadToImageHosting } from "./image-hosting.js";

/**
 * 智谱 AI 功能（互动小说 / 图片生成）。
 *
 * - 文本：glm-4-flash（免费）；图片：cogview-3-flash（免费）；
 * - 登录用户 + 每日限额（ai_usage 表持久化，跨重启保留）；
 * - 图片生成后下载并转存图床（CogView 返回的 URL 会过期）。
 */

const STORY_GENRES = ["科幻", "奇幻", "悬疑", "武侠", "都市", "惊悚"] as const;
const IMAGE_RATIOS = ["1:1", "16:9", "9:16"] as const;
const IMAGE_STYLES = ["写实", "插画", "像素", "赛博朋克", "水墨"] as const;

/** 每日限额：文本（创建 5 / 续写 30）、图片 20 */
const DAILY_LIMITS: Record<string, number> = {
	"story:create": 5,
	"story:continue": 30,
	"image:generate": 20,
};

const CTX_RECENT_ENTRIES = 5;

interface StoryRow {
	id: number;
	user_id: number;
	title: string;
	genre: string;
	created_at: string;
	updated_at: string;
}

interface StoryEntryRow {
	id: number;
	story_id: number;
	seq: number;
	content: string;
	choices: string;
	chosen: string;
	created_at: string;
}

interface ImageRow {
	id: number;
	user_id: number;
	prompt: string;
	ratio: string;
	style: string;
	image_url: string;
	created_at: string;
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

/** 检查并递增每日用量；超限抛错 */
function consumeQuota(userId: number, kind: string): void {
	const limit = DAILY_LIMITS[kind];
	if (!limit) return;
	const date = today();
	const row = db
		.prepare(
			"SELECT count FROM ai_usage WHERE user_id = ? AND date = ? AND kind = ?",
		)
		.get(userId, date, kind) as { count: number } | undefined;
	const count = row?.count ?? 0;
	if (count >= limit) {
		throw new Error("今日额度已用完，请明天再试");
	}
	db.prepare(
		`INSERT INTO ai_usage (user_id, date, kind, count) VALUES (?, ?, ?, 1)
       ON CONFLICT(user_id, date, kind) DO UPDATE SET count = count + 1`,
	).run(userId, date, kind);
}

async function zhipuRequest(
	path: string,
	body: Record<string, unknown>,
): Promise<{ ok: boolean; json: Record<string, unknown>; status: number }> {
	const res = await fetch(`${config.zhipu.baseUrl}${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${config.zhipu.apiKey}`,
		},
		body: JSON.stringify(body),
	});
	const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
	return { ok: res.ok, json, status: res.status };
}

/** 文本对话（JSON 输出），返回解析后的对象 */
async function chatJson(
	system: string,
	user: string,
): Promise<Record<string, unknown>> {
	const { ok, json, status } = await zhipuRequest("/chat/completions", {
		model: "glm-4-flash",
		messages: [
			{ role: "system", content: system },
			{ role: "user", content: user },
		],
		response_format: { type: "json_object" },
		temperature: 0.9,
	});
	if (!ok) {
		throw new Error(`AI 服务暂不可用（${status}）`);
	}
	const content = (json.choices as { message?: { content?: string } }[])?.[0]
		?.message?.content;
	if (!content) throw new Error("AI 返回内容为空");
	try {
		return JSON.parse(content) as Record<string, unknown>;
	} catch {
		throw new Error("AI 返回格式异常");
	}
}

/** SQLite datetime('now') 存的是 UTC（YYYY-MM-DD HH:MM:SS），转成带时区标记的 ISO 字符串 */
function toIsoUtc(sqliteTime: string): string {
	return new Date(`${sqliteTime.replace(" ", "T")}Z`).toISOString();
}

function parseChoices(raw: unknown): string[] {	if (!Array.isArray(raw)) return [];
	return raw
		.map((c) => (typeof c === "string" ? c.trim().slice(0, 100) : ""))
		.filter(Boolean)
		.slice(0, 3);
}

function parseStoryResult(raw: Record<string, unknown>): {
	title: string;
	content: string;
	choices: string[];
} {
	const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 60) : "未命名故事";
	const content = typeof raw.content === "string" ? raw.content.trim() : "";
	if (!content) throw new Error("AI 返回故事内容为空");
	return { title: title || "未命名故事", content, choices: parseChoices(raw.choices) };
}

const STORY_SYSTEM = `你是一个互动小说作者。严格按照要求输出 JSON（不要输出其他内容）：
{"title": "故事标题(6-20字)", "content": "故事正文(200-300字，中文)", "choices": ["选项A(15字内)", "选项B(15字内)", "选项C(15字内)"]}`;

function buildStoryPrompt(genre: string): string {
	return `请创作一段${genre}题材互动小说的开场。`;
}

function buildContinuePrompt(history: string, choice: string): string {
	return `以下是故事历史（按顺序，最新在后）：\n${history}\n\n玩家选择了：「${choice}」。请据此续写故事，输出同样的 JSON 结构（title 可省略或保持原题）。`;
}

export const aiRouter = Router();

const aiLimiter = createRateLimiter({
	windowMs: 60 * 1000,
	max: 20,
	keyPrefix: "ai",
});

aiRouter.use(requireAuth, aiLimiter);

/** 检查 AI 是否启用 */
aiRouter.use((_req, res, next) => {
	if (!zhipuEnabled()) {
		res.status(503).json({ error: "AI 功能未启用" });
		return;
	}
	next();
});

/** 创建互动小说（AI 生成开场 + 3 选项） */
aiRouter.post("/stories", (req, res) => {
	const genre = typeof req.body?.genre === "string" ? req.body.genre : "";
	if (!STORY_GENRES.includes(genre as (typeof STORY_GENRES)[number])) {
		res.status(400).json({ error: "请选择正确的题材" });
		return;
	}
	try {
		consumeQuota(req.user!.id, "story:create");
	} catch (error) {
		res.status(429).json({ error: (error as Error).message });
		return;
	}
	void (async () => {
		try {
			const result = await chatJson(STORY_SYSTEM, buildStoryPrompt(genre));
			const { title, content, choices } = parseStoryResult(result);
			const storyRes = db
				.prepare(
					"INSERT INTO ai_stories (user_id, title, genre) VALUES (?, ?, ?)",
				)
				.run(req.user!.id, title, genre);
			const storyId = Number(storyRes.lastInsertRowid);
			db.prepare(
				`INSERT INTO ai_story_entries (story_id, seq, content, choices)
         VALUES (?, 1, ?, ?)`,
			).run(storyId, content, JSON.stringify(choices));
			res.status(201).json({
				story: {
					id: storyId,
					title,
					genre,
					content,
					choices,
				},
			});
		} catch (error) {
			res.status(502).json({ error: (error as Error).message });
		}
	})();
});

/** 我的故事列表 */
aiRouter.get("/stories", (req, res) => {
	const rows = db
		.prepare(
			`SELECT s.*, (SELECT COUNT(*) FROM ai_story_entries e WHERE e.story_id = s.id) AS entries
       FROM ai_stories s WHERE s.user_id = ? ORDER BY s.updated_at DESC`,
		)
		.all(req.user!.id) as (StoryRow & { entries: number })[];
	res.json({
		stories: rows.map((row) => ({
			id: row.id,
			title: row.title,
			genre: row.genre,
			entries: row.entries,
			updatedAt: toIsoUtc(row.updated_at),
		})),
	});
});

/** 故事详情（全部条目） */
aiRouter.get("/stories/:id", (req, res) => {
	const story = db
		.prepare("SELECT * FROM ai_stories WHERE id = ? AND user_id = ?")
		.get(Number(req.params.id), req.user!.id) as StoryRow | undefined;
	if (!story) {
		res.status(404).json({ error: "故事不存在" });
		return;
	}
	const entries = db
		.prepare(
			"SELECT * FROM ai_story_entries WHERE story_id = ? ORDER BY seq ASC",
		)
		.all(story.id) as StoryEntryRow[];
	res.json({
		story: {
			id: story.id,
			title: story.title,
			genre: story.genre,
			createdAt: toIsoUtc(story.created_at),
			updatedAt: toIsoUtc(story.updated_at),
		},
		entries: entries.map((e) => ({
			id: e.id,
			seq: e.seq,
			content: e.content,
			choices: JSON.parse(e.choices) as string[],
			chosen: e.chosen,
			createdAt: toIsoUtc(e.created_at),
		})),
	});
});

/** 续写故事（基于用户选择） */
aiRouter.post("/stories/:id/continue", (req, res) => {
	const story = db
		.prepare("SELECT * FROM ai_stories WHERE id = ? AND user_id = ?")
		.get(Number(req.params.id), req.user!.id) as StoryRow | undefined;
	if (!story) {
		res.status(404).json({ error: "故事不存在" });
		return;
	}
	const choice = typeof req.body?.choice === "string" ? req.body.choice.trim() : "";
	if (!choice || choice.length > 100) {
		res.status(400).json({ error: "请选择一个有效的选项" });
		return;
	}
	try {
		consumeQuota(req.user!.id, "story:continue");
	} catch (error) {
		res.status(429).json({ error: (error as Error).message });
		return;
	}
	void (async () => {
		try {
			// 上下文：开场 + 最近 N 段（含选择）
			const entries = db
				.prepare(
					"SELECT * FROM ai_story_entries WHERE story_id = ? ORDER BY seq DESC LIMIT ?",
				)
				.all(story.id, CTX_RECENT_ENTRIES) as StoryEntryRow[];
			const ordered = [...entries].reverse();
			const history = ordered
				.map((e) => `${e.chosen ? `（玩家选择：${e.chosen}）\n` : ""}${e.content}`)
				.join("\n\n");
			const result = await chatJson(
				STORY_SYSTEM,
				buildContinuePrompt(history, choice),
			);
			const { content, choices } = parseStoryResult(result);
			const maxSeq = db
				.prepare(
					"SELECT COALESCE(MAX(seq), 0) AS m FROM ai_story_entries WHERE story_id = ?",
				)
				.get(story.id) as { m: number };
			db.prepare(
				`INSERT INTO ai_story_entries (story_id, seq, content, choices, chosen)
         VALUES (?, ?, ?, ?, ?)`,
			).run(story.id, maxSeq.m + 1, content, JSON.stringify(choices), choice);
			db.prepare(
				"UPDATE ai_stories SET updated_at = datetime('now') WHERE id = ?",
			).run(story.id);
			res.status(201).json({
				entry: {
					seq: maxSeq.m + 1,
					content,
					choices,
					chosen: choice,
				},
			});
		} catch (error) {
			res.status(502).json({ error: (error as Error).message });
		}
	})();
});

/** 删除故事 */
aiRouter.delete("/stories/:id", (req, res) => {
	const result = db
		.prepare("DELETE FROM ai_stories WHERE id = ? AND user_id = ?")
		.run(Number(req.params.id), req.user!.id);
	if (result.changes === 0) {
		res.status(404).json({ error: "故事不存在" });
		return;
	}
	res.json({ ok: true });
});

/** 生成图片（下载后转存图床） */
aiRouter.post("/images", (req, res) => {
	const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
	if (!prompt || prompt.length > 500) {
		res.status(400).json({ error: "请填写提示词（500 字内）" });
		return;
	}
	const ratio = IMAGE_RATIOS.includes(req.body?.ratio)
		? (req.body.ratio as string)
		: "1:1";
	const style = IMAGE_STYLES.includes(req.body?.style)
		? (req.body.style as string)
		: "";
	try {
		consumeQuota(req.user!.id, "image:generate");
	} catch (error) {
		res.status(429).json({ error: (error as Error).message });
		return;
	}
	void (async () => {
		try {
			const sizeMap: Record<string, string> = {
				"1:1": "1024x1024",
				"16:9": "1280x720",
				"9:16": "720x1280",
			};
			const fullPrompt = style ? `${style}风格，${prompt}` : prompt;
			const { ok, json, status } = await zhipuRequest("/images/generations", {
				model: "cogview-3-flash",
				prompt: fullPrompt,
				size: sizeMap[ratio] ?? "1024x1024",
			});
			if (!ok) {
				throw new Error(`AI 绘图服务暂不可用（${status}）`);
			}
			const url = (json.data as { url?: string }[])?.[0]?.url;
			if (!url) throw new Error("AI 未返回图片");
			// 下载并转存图床（CogView URL 会过期）
			const imgRes = await fetch(url);
			if (!imgRes.ok) throw new Error("图片下载失败");
			const buffer = Buffer.from(await imgRes.arrayBuffer());
			const hosted = await uploadToImageHosting({
				originalname: `ai-${Date.now()}.png`,
				mimetype: "image/png",
				buffer,
			});
			const finalUrl = hosted ? toPublicImageUrl(hosted.url) : url;
			const imageRes = db
				.prepare(
					"INSERT INTO ai_images (user_id, prompt, ratio, style, image_url) VALUES (?, ?, ?, ?, ?)",
				)
				.run(req.user!.id, prompt, ratio, style, finalUrl);
			res.status(201).json({
				image: {
					id: Number(imageRes.lastInsertRowid),
					prompt,
					ratio,
					style,
					url: finalUrl,
				},
			});
		} catch (error) {
			res.status(502).json({ error: (error as Error).message });
		}
	})();
});

/** 我的生成历史 */
aiRouter.get("/images", (req, res) => {
	const rows = db
		.prepare(
			"SELECT * FROM ai_images WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
		)
		.all(req.user!.id) as ImageRow[];
	res.json({
		images: rows.map((row) => ({
			id: row.id,
			prompt: row.prompt,
			ratio: row.ratio,
			style: row.style,
			url: row.image_url,
			createdAt: row.created_at,
		})),
	});
});

/** 删除生成记录 */
aiRouter.delete("/images/:id", (req, res) => {
	const result = db
		.prepare("DELETE FROM ai_images WHERE id = ? AND user_id = ?")
		.run(Number(req.params.id), req.user!.id);
	if (result.changes === 0) {
		res.status(404).json({ error: "记录不存在" });
		return;
	}
	res.json({ ok: true });
});

/** 当前用户今日剩余额度 */
aiRouter.get("/quota", (req, res) => {
	const date = today();
	const rows = db
		.prepare("SELECT kind, count FROM ai_usage WHERE user_id = ? AND date = ?")
		.all(req.user!.id, date) as { kind: string; count: number }[];
	const used: Record<string, number> = {};
	for (const row of rows) used[row.kind] = row.count;
	res.json({
		quota: {
			storyCreate: DAILY_LIMITS["story:create"] - (used["story:create"] ?? 0),
			storyContinue:
				DAILY_LIMITS["story:continue"] - (used["story:continue"] ?? 0),
			imageGenerate:
				DAILY_LIMITS["image:generate"] - (used["image:generate"] ?? 0),
		},
	});
});
