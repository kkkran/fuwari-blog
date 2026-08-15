import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			// 与 tsconfig 的 "@/*" 路径别名保持一致，否则 import "@/..." 的模块无法在测试中加载
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	test: {
		include: [
			"src/**/*.test.ts",
			"src/**/*.test.tsx",
			"scripts/**/*.test.js",
		],
	},
});
