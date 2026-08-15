/**
 * 收款码 PNG → 等价 SVG 转换脚本。
 *
 * 原理：解码 → 灰度 → Otsu 二值化 → 行游程（RLE）垂直合并成矩形，
 * 输出与位图逐像素等价的 <rect> SVG（矢量、任意缩放不模糊）。
 * 若矢量结果异常臃肿（超过原 PNG 2.5 倍），回退为内嵌 base64 的等价 SVG。
 *
 * 用法：node scripts/png-to-svg.js <input.png> <output.svg>
 */
import sharp from "sharp";
import { readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Otsu 全局阈值：输入 256 桶灰度直方图，返回阈值 t（< t 判为黑） */
export function otsuThreshold(hist) {
	const total = hist.reduce((a, b) => a + b, 0);
	if (total === 0) return 128;
	let sum = 0;
	for (let i = 0; i < 256; i++) sum += i * hist[i];
	let sumB = 0;
	let wB = 0;
	let maxVar = -1;
	let threshold = 128;
	for (let t = 0; t < 256; t++) {
		wB += hist[t];
		if (wB === 0) continue;
		const wF = total - wB;
		if (wF === 0) break;
		sumB += t * hist[t];
		const mB = sumB / wB;
		const mF = (sum - sumB) / wF;
		const between = wB * wF * (mB - mF) * (mB - mF);
		if (between > maxVar) {
			maxVar = between;
			threshold = t;
		}
	}
	return threshold;
}

/**
 * 行游程垂直合并：把二值位图（1=黑）压成黑矩形列表。
 * 逐行扫描黑游程，与上一行同位置游程合并，否则闭合输出。
 * @returns {{ x: number; y: number; w: number; h: number }[]}
 */
export function runLengthRects(binary, width, height) {
	// key = (c0 << 32) | c1 → 起始行 y0
	const active = new Map();
	const rects = [];
	for (let y = 0; y < height; y++) {
		const rowOffset = y * width;
		const used = new Set();
		let x = 0;
		while (x < width) {
			if (binary[rowOffset + x] === 1) {
				let c0 = x;
				while (x < width && binary[rowOffset + x] === 1) x++;
				const key = (c0 << 20) | x; // 位宽 20 足以覆盖 < 1M 像素宽
				if (active.has(key)) {
					active.set(key, [active.get(key)[0], y]);
				} else {
					active.set(key, [y, y]);
				}
				used.add(key);
			} else {
				x++;
			}
		}
		for (const [key, [y0, y1]] of active) {
			if (!used.has(key)) {
				const c0 = key >> 20;
				const c1 = key & 0xfffff;
				rects.push({ x: c0, y: y0, w: c1 - c0, h: y1 - y0 + 1 });
				active.delete(key);
			}
		}
	}
	for (const [key, [y0, y1]] of active) {
		const c0 = key >> 20;
		const c1 = key & 0xfffff;
		rects.push({ x: c0, y: y0, w: c1 - c0, h: y1 - y0 + 1 });
	}
	return rects;
}

/** 矩形列表 → SVG 字符串 */
export function rectsToSvg(width, height, rects) {
	const body = rects
		.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/>`)
		.join("");
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
		`viewBox="0 0 ${width} ${height}">` +
		`<rect width="${width}" height="${height}" fill="#ffffff"/>` +
		`<g fill="#000000">${body}</g>` +
		`</svg>`
	);
}

/** base64 内嵌等价 SVG（兜底，渲染与原图完全一致） */
export async function embeddedSvg(inputPath, width, height) {
	const data = await readFile(inputPath);
	const base64 = data.toString("base64");
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
		`viewBox="0 0 ${width} ${height}">` +
		`<image href="data:image/png;base64,${base64}" width="${width}" height="${height}"/>` +
		`</svg>`
	);
}

/** 解码 → 灰度 → Otsu 二值化，返回 { binary, width, height } */
export async function toBinary(inputPath) {
	const { data, info } = await sharp(inputPath).grayscale().raw().toBuffer({
		resolveWithObject: true,
	});
	const { width, height } = info;
	const hist = new Array(256).fill(0);
	for (let i = 0; i < data.length; i++) hist[data[i]]++;
	const threshold = otsuThreshold(hist);
	const binary = new Uint8Array(width * height);
	for (let i = 0; i < data.length; i++) {
		binary[i] = data[i] < threshold ? 1 : 0;
	}
	return { binary, width, height };
}

/** 主流程：PNG → SVG（矢量优先，臃肿则回退内嵌） */
export async function pngToSvg(inputPath, outputPath) {
	const { binary, width, height } = await toBinary(inputPath);
	const rects = runLengthRects(binary, width, height);
	const svg = rectsToSvg(width, height, rects);
	const inputSize = (await stat(inputPath)).size;
	let finalSvg = svg;
	let mode = "vector";
	if (Buffer.byteLength(svg, "utf8") > inputSize * 2.5) {
		finalSvg = await embeddedSvg(inputPath, width, height);
		mode = "embedded";
	}
	await writeFile(outputPath, finalSvg, "utf8");
	return {
		mode,
		width,
		height,
		rects: rects.length,
		svgBytes: Buffer.byteLength(finalSvg, "utf8"),
		inputBytes: inputSize,
	};
}

// CLI 入口
const isEntry =
	process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	const [, , input, output] = process.argv;
	if (!input || !output) {
		console.error("用法：node scripts/png-to-svg.js <input.png> <output.svg>");
		process.exit(1);
	}
	const result = await pngToSvg(input, output);
	console.log(
		`[png-to-svg] ${input} -> ${output}（${result.mode}，` +
			`${result.width}x${result.height}，${result.rects} 个矩形，` +
			`${result.svgBytes} B / 原 ${result.inputBytes} B）`,
	);
}
