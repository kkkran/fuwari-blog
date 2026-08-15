/**
 * 赞助历史数据迁移：将 src/data/sponsors/*.json 导入 SQLite（server 的 sponsors 表）。
 *
 * 金额口径（与 /api/sponsors 统计一致，Q9-A）：
 * - 仅人民币数字（¥/￥/CNY 前后缀）计入 amount；其余单位（B币/USDC/电池等）amount=0，
 *   原文保存在 amount_text 中照常展示。
 * - 幂等：同 display_name + amount_text + 无账号 的记录已存在则跳过。
 *
 * 用法：node scripts/migrate-sponsors.js [数据库路径]
 * 默认路径：server/data/fuwari.db（相对本脚本解析）
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SPONSORS_DIR = path.join(__dirname, "..", "src", "data", "sponsors");

/** 人民币金额解析：返回 { amount, amountText }；非人民币/无法解析 → amount=0，原文保留 */
export function parseAmount(text) {
	const trimmed = typeof text === "string" ? text.trim() : "";
	const match = trimmed.match(/^[¥￥]?\s*(\d+(?:\.\d+)?)\s*(?:￥|¥|CNY)?$/i);
	if (match) {
		return { amount: Number(match[1]), amountText: trimmed };
	}
	return { amount: 0, amountText: trimmed };
}

/** 补零日期："2026-1-12" → "2026-01-12" */
function normalizeDate(date) {
	const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(date ?? "").trim());
	if (!match) return String(date ?? "");
	return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

/** 单条 JSON → 数据行 */
export function parseSponsorFile(jsonText) {
	const raw = JSON.parse(jsonText);
	const { amount, amountText } = parseAmount(raw.amount);
	return {
		displayName: String(raw.name ?? "").trim(),
		avatarUrl: String(raw.avatar ?? "").trim(),
		amount,
		amountText,
		approvedAt: normalizeDate(raw.date),
	};
}

/** 读取目录下全部 JSON，跳过损坏文件；目录不存在时返回空数组 */
export function loadSponsorFiles(dir = SPONSORS_DIR) {
	const rows = [];
	if (!existsSync(dir)) return rows;
	for (const file of readdirSync(dir)) {
		if (!file.endsWith(".json")) continue;
		try {
			rows.push(parseSponsorFile(readFileSync(path.join(dir, file), "utf8")));
		} catch {
			console.warn(`[migrate-sponsors] 跳过无法解析的文件：${file}`);
		}
	}
	return rows;
}

/** 写入数据库（幂等），返回新增条数 */
export async function migrateSponsors(dbPath) {
	const Database = (await import("better-sqlite3")).default;
	const db = new Database(dbPath);
	try {
		const rows = loadSponsorFiles();
		const insert = db.prepare(
			`INSERT INTO sponsors
       (user_id, display_name, avatar_url, amount, amount_text, anonymous, remark, status, source_ip, approved_at)
       VALUES (NULL, ?, ?, ?, ?, 0, '', 'approved', '', ?)`,
		);
		const exists = db.prepare(
			`SELECT id FROM sponsors
       WHERE user_id IS NULL AND display_name = ? AND amount_text = ? LIMIT 1`,
		);
		let inserted = 0;
		for (const row of rows) {
			if (exists.get(row.displayName, row.amountText)) continue;
			insert.run(
				row.displayName,
				row.avatarUrl,
				row.amount,
				row.amountText,
				row.approvedAt,
			);
			inserted++;
		}
		console.log(
			`[migrate-sponsors] 共读取 ${rows.length} 条，新增 ${inserted} 条 → ${dbPath}`,
		);
		return inserted;
	} finally {
		db.close();
	}
}

// CLI 入口
const isEntry =
	process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	const dbPath = process.argv[2] ?? path.join(__dirname, "..", "server", "data", "fuwari.db");
	await migrateSponsors(dbPath);
}
