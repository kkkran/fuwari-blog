/** @type {import('tailwindcss').Config} */
const defaultTheme = require("tailwindcss/defaultTheme");
module.exports = {
	content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue,mjs}"],
	darkMode: "class", // allows toggling dark mode manually
	theme: {
		extend: {
			fontFamily: {
				// 对齐 2x.nz：Geist Variable 自托管，中文回退系统字体
				sans: ["Geist Variable", ...defaultTheme.fontFamily.sans],
				mono: ["Geist Mono Variable", ...defaultTheme.fontFamily.mono],
			},
			borderRadius: {
				// 对齐 2x.nz：全站直角（--radius: 0px），仅 rounded-full 保留
				none: "0",
				sm: "0",
				DEFAULT: "0",
				md: "0",
				lg: "0",
				xl: "0",
				"2xl": "0",
				"3xl": "0",
				full: "9999px",
			},
		},
	},
	plugins: [require("@tailwindcss/typography")],
};
