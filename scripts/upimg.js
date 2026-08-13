/**
 * 上传图片到 oneimg 图床（一键上传 + 复制 Markdown 引用到剪贴板）。
 *
 * 用法：
 *   node scripts/upimg.js <图片路径> [更多图片...]
 *   pnpm upimg ./screenshot.png ./cover.webp
 *
 * 环境变量：
 *   ONEIMG_BASE_URL    图床地址（默认 http://127.0.0.1:8080）
 *   ONEIMG_USERNAME    图床账号（默认 admin）
 *   ONEIMG_PASSWORD    图床密码（必填，也可用 --pass 参数）
 *
 * 输出：每张图片一行 `![](图床URL)`，并全部复制到剪贴板。
 */
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { loginToOneimg, toMarkdownImage, uploadImageToOneimg } from "./lib/oneimg-client.js";

const MIME_TYPES = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".svg": "image/svg+xml",
	".bmp": "image/bmp",
	".avif": "image/avif",
};

function parseArgs(argv) {
	const files = [];
	let password = process.env.ONEIMG_PASSWORD ?? "";
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--pass" && i + 1 < argv.length) {
			password = argv[++i];
		} else if (arg === "--help" || arg === "-h") {
			return null;
		} else {
			files.push(arg);
		}
	}
	return {
		baseUrl: process.env.ONEIMG_BASE_URL ?? "http://127.0.0.1:8080",
		username: process.env.ONEIMG_USERNAME ?? "admin",
		password,
		files,
	};
}

function copyToClipboard(text) {
	if (process.platform === "win32") {
		execFileSync("clip", { input: text });
	} else if (process.platform === "darwin") {
		execFileSync("pbcopy", { input: text });
	} else {
		try {
			execFileSync("xclip", { input: text });
		} catch {
			console.warn("未找到 xclip，跳过剪贴板复制");
		}
	}
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (!args || args.files.length === 0) {
		console.error(
			"用法：node scripts/upimg.js <图片路径> [更多图片...]（ONEIMG_PASSWORD 必填）",
		);
		process.exit(1);
	}
	if (!args.password) {
		console.error("错误：缺少图床密码，请设置 ONEIMG_PASSWORD 环境变量或使用 --pass 参数");
		process.exit(1);
	}

	const cookie = await loginToOneimg(args);
	const lines = [];
	for (const file of args.files) {
		const buffer = await readFile(file);
		const mimetype = MIME_TYPES[extname(file).toLowerCase()] ?? "image/png";
		const { url } = await uploadImageToOneimg(
			{ baseUrl: args.baseUrl, cookie },
			{ name: file.split(/[\\/]/).pop() ?? "image.png", mimetype, buffer },
		);
		lines.push(toMarkdownImage(url));
		console.log(toMarkdownImage(url));
	}

	copyToClipboard(lines.join("\n"));
	console.log(`\n已复制 ${lines.length} 个图片引用到剪贴板`);
}

main().catch((error) => {
	console.error(`上传失败：${error.message}`);
	process.exit(1);
});
