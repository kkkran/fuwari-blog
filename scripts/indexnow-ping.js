/**
 * IndexNow 提交脚本：把新增/修改的文章 URL 即时通知 Bing/Yandex/Seznam。
 *
 * 用法：
 *   node scripts/indexnow-ping.js            # 读取 git 最近一次提交变更的文章
 *   node scripts/indexnow-ping.js slug1 slug2 # 指定文章 slug
 *   node scripts/indexnow-ping.js --all      # 全量提交 sitemap 中所有文章
 *
 * 前置：public/<key>.txt 已存在（key 为 32 位 hex，IndexNow 规范要求放站点根）。
 * 建议在站点部署上线后执行，确保搜索引擎抓取时 URL 可访问。
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
	collectPostUrlsFromGit,
	normalizeKey,
	toIndexNowPayload,
} from "./indexnow-lib.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const SITE_URL = process.env.SITE_URL ?? "https://miscoke.top";
const HOST = SITE_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

function findKey() {
	const publicDir = path.join(PROJECT_ROOT, "public");
	const files = fs.readdirSync(publicDir).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
	if (files.length === 0) {
		throw new Error(
			"未找到 IndexNow key 文件（public/<32位hex>.txt）。请先执行：node -e \"console.log([...crypto.randomBytes(16)].map(b=>b.toString(16).padStart(2,'0')).join(''))\" 生成并写入 public/。",
		);
	}
	if (files.length > 1) {
		throw new Error(`public/ 下存在多个 key 文件：${files.join(", ")}，请只保留一个。`);
	}
	const key = normalizeKey(fs.readFileSync(path.join(publicDir, files[0]), "utf-8"));
	return { key, file: files[0] };
}

function getRecentPostUrls() {
	const output = execSync("git diff --name-only HEAD~1 HEAD", {
		cwd: PROJECT_ROOT,
		encoding: "utf-8",
	});
	const files = output.split("\n").map((l) => l.trim()).filter(Boolean);
	return collectPostUrlsFromGit(files, SITE_URL);
}

async function submit(urls) {
	if (urls.length === 0) {
		console.log("没有需要提交的 URL。");
		return;
	}
	const { key } = findKey();
	const payload = toIndexNowPayload({ host: HOST, key, urls });

	console.log(`提交 ${urls.length} 个 URL 到 IndexNow...`);
	console.log(urls.map((u) => `  - ${u}`).join("\n"));

	const res = await fetch(INDEXNOW_ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json; charset=utf-8" },
		body: JSON.stringify(payload),
	});

	if (res.ok || res.status === 202) {
		console.log("✅ IndexNow 提交成功");
	} else {
		console.error(`❌ IndexNow 提交失败（HTTP ${res.status}）：${await res.text()}`);
		process.exitCode = 1;
	}
}

const args = process.argv.slice(2);

if (args.includes("--all")) {
	const sitemap = await fetch(`${SITE_URL}/sitemap.xml`);
	const xml = await sitemap.text();
	const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
	await submit(urls);
} else if (args.length > 0) {
	const urls = args.map((slug) => `${SITE_URL}/posts/${encodeURIComponent(slug)}/`);
	await submit(urls);
} else {
	await submit(getRecentPostUrls());
}
