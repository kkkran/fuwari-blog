// scripts/generate-image-variants.js
// 构建期为站内静态图生成小尺寸变体（避免小图渲染拉大原图，如 241KB 的 seo-cover 用于 28px logo）。
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const publicDir = path.join(root, "public");

// 变体定义：{ 源文件, 输出文件, 目标宽度 }
const VARIANTS = [
	{ src: "seo-cover.webp", out: "seo-cover-64.webp", width: 64 },
	{ src: "seo-cover.webp", out: "seo-cover-256.webp", width: 256 },
];

async function main() {
	for (const v of VARIANTS) {
		const input = path.join(publicDir, v.src);
		if (!fs.existsSync(input)) {
			console.log(`[image-variants] 跳过 ${v.src}（不存在）`);
			continue;
		}
		const out = path.join(publicDir, v.out);
		await sharp(input)
			.resize({ width: v.width })
			.webp({ quality: 80 })
			.toFile(out);
		console.log(`[image-variants] 生成 ${v.out} (${v.width}px)`);
	}
}

main().catch((err) => {
	console.error("[image-variants] 失败:", err);
	process.exit(1);
});