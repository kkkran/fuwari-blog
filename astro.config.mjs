import svelte from "@astrojs/svelte";
import tailwind from "@astrojs/tailwind";
import node from "@astrojs/node";
import { defineConfig, passthroughImageService } from "astro/config";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeComponents from "rehype-components"; /* Render the custom directive content */
import rehypeExternalLinks from "rehype-external-links";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import remarkDirective from "remark-directive"; /* Handle directives */
import remarkMath from "remark-math";
import remarkSectionize from "remark-sectionize";
import { SKIP, visit } from "unist-util-visit";
import {
	imageFallbackConfig,
	serviceConfig,
	siteConfig,
	umamiConfig,
} from "./src/config.ts";
import { rehypeAIAdmonition } from "./src/plugins/rehype-ai-admonition.mjs";
import { AdmonitionComponent } from "./src/plugins/rehype-component-admonition.mjs";
import { GithubCardComponent } from "./src/plugins/rehype-component-github-card.mjs";
import { UrlCardComponent } from "./src/plugins/rehype-component-url-card.mjs";
import rehypeImageFallback from "./src/plugins/rehype-image-fallback.mjs";
import { parseDirectiveNode } from "./src/plugins/remark-directive-rehype.js";
import { remarkExcerpt } from "./src/plugins/remark-excerpt.js";
import { remarkGithubAdmonitions } from "./src/plugins/remark-github-admonitions.js";
import { remarkReadingTime } from "./src/plugins/remark-reading-time.mjs";

function remarkSpoiler() {
	return (tree) => {
		visit(tree, "paragraph", (node) => {
			const newChildren = [];
			let inSpoiler = false;

			// Check if any child contains '||'
			const hasSpoiler = node.children.some(
				(child) =>
					child.type === "text" && child.value && child.value.includes("||"),
			);

			if (!hasSpoiler) return;

			for (const child of node.children) {
				if (child.type === "text") {
					const parts = child.value.split("||");

					if (parts.length === 1) {
						newChildren.push(child);
						continue;
					}

					parts.forEach((part, index) => {
						if (part) {
							newChildren.push({ type: "text", value: part });
						}

						if (index < parts.length - 1) {
							if (!inSpoiler) {
								newChildren.push({
									type: "html",
									value: '<span class="spoiler" title="点击显示">',
								});
								inSpoiler = true;
							} else {
								newChildren.push({
									type: "html",
									value: "</span>",
								});
								inSpoiler = false;
							}
						}
					});
				} else {
					newChildren.push(child);
				}
			}

			if (inSpoiler) {
				newChildren.push({
					type: "html",
					value: "</span>",
				});
			}

			node.children = newChildren;
			return SKIP;
		});
	};
}

// https://astro.build/config
export default defineConfig({
	image: {
		service: passthroughImageService(),
	},
	site: `https://${siteConfig.customDomain}`,
	prefetch: {
		prefetchAll: true,
		defaultStrategy: "load",
	},
	base: "/",
	// 博客列表/详情/数据端点通过 prerender=false 动态渲染（运行时查后端数据库）；
	// Astro 6 默认即"静态为主 + 按页面动态"（原 hybrid 语义），其余页面保持静态构建
	adapter: node({
		mode: "standalone",
	}),
	redirects: {
		"/privacy-policy": {
			status: 302,
			destination: `https://${siteConfig.customDomain}/posts/privacy-policy/`,
		},
		"/long": {
			status: 302,
			destination:
				"https://iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii.iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii.in/",
		},
		"/tit": {
			status: 302,
			destination: "/posts/pin/",
		},
		"/q": {
			status: 302,
			destination: "/posts/pin/",
		},
		"/t": {
			status: 302,
			destination: serviceConfig.forumBaseUrl,
		},
		"/ak": {
			status: 302,
			destination:
				"https://akile.io/register?aff_code=503fe5ea-e7c5-4d68-ae05-6de99513680e",
		},
		"/yyb": {
			status: 302,
			destination: "/sponsors/",
		},
		"/wly": {
			status: 302,
			destination: "https://w1.wlylogin.com:8888/#/register?code=FNQwOQBM",
		},
		"/mly": {
			status: 302,
			destination: "https://muleyun.com/aff/GOTRJLPN",
		},
		"/tly": {
			status: 302,
			destination: "https://tianlicloud.cn/aff/HNNCFKGP",
		},
		"/kook": {
			status: 302,
			destination: "https://kook.vip/K29zpT",
		},
		"/gal": {
			status: 302,
			destination: "/post/gal/",
		},
		"/ok": {
			status: 302,
			destination: `${serviceConfig.umamiBaseUrl}/share/${umamiConfig.shareId}`,
		},
		"/donate": {
			status: 302,
			destination: "/sponsors",
		},
		"/tg": {
			status: 302,
			destination: "https://t.me/+_07DERp7k1ljYTc1",
		},
		"/esa": {
			status: 302,
			destination:
				"https://tianchi.aliyun.com/specials/promotion/freetier/esa?taskCode=25254&recordId=c856e61228828a0423417a767828d166",
		},
		"/plan": {
			status: 302,
			destination: "/archive/",
		},
		"/iku": {
			status: 302,
			destination: "https://ikuuu.de/",
		},
		"/hnr": {
			status: 302,
			destination:
				"https://subspace.shop/products/lin-pianpian-keychain-the-weeping-swan-ten-days-of-the-citys-fall?_pos=1&_sid=5ba9d94dd&_ss=r",
		},
	},
	integrations: [
		tailwind({
			nesting: true,
		}),
		svelte({
			compilerOptions: {
				compatibility: {
					componentApi: 4,
				},
			},
		}),
	],
	markdown: {
		syntaxHighlight: false,
		remarkPlugins: [
			remarkSpoiler,
			remarkMath,
			remarkReadingTime,
			remarkExcerpt,
			remarkGithubAdmonitions,
			remarkDirective,
			remarkSectionize,
			parseDirectiveNode,
		],
		rehypePlugins: [
			rehypeKatex,
			rehypeSlug,
			[rehypeImageFallback, imageFallbackConfig],
			[
				rehypeComponents,
				{
					components: {
						github: GithubCardComponent,
						url: (x, y) => UrlCardComponent(x, y, serviceConfig.iconMetaBaseUrl),
						note: (x, y) => AdmonitionComponent(x, y, "note"),
						tip: (x, y) => AdmonitionComponent(x, y, "tip"),
						important: (x, y) => AdmonitionComponent(x, y, "important"),
						caution: (x, y) => AdmonitionComponent(x, y, "caution"),
						warning: (x, y) => AdmonitionComponent(x, y, "warning"),
						ai: (x, y) => AdmonitionComponent(x, y, "ai"),
					},
				},
			],
			rehypeAIAdmonition,
			[
				rehypeExternalLinks,
				{
					target: "_blank",
				},
			],
			[
				rehypeAutolinkHeadings,
				{
					behavior: "append",
					properties: {
						className: ["anchor"],
					},
					content: {
						type: "element",
						tagName: "span",
						properties: {
							className: ["anchor-icon"],
							"data-pagefind-ignore": true,
						},
						children: [
							{
								type: "text",
								value: "#",
							},
						],
					},
				},
			],
		],
	},
	vite: {
		optimizeDeps: {
			include: [
				"markdown-it",
				"prismjs",
				"prismjs/components/prism-bash",
				"prismjs/components/prism-typescript",
				"prismjs/components/prism-javascript",
				"prismjs/components/prism-python",
				"prismjs/components/prism-json",
				"prismjs/components/prism-yaml",
				"prismjs/components/prism-toml",
				"prismjs/components/prism-markdown",
				"prismjs/components/prism-css",
				"prismjs/components/prism-scss",
				"prismjs/components/prism-sql",
				"prismjs/components/prism-docker",
				"prismjs/components/prism-nginx",
				"prismjs/components/prism-go",
				"prismjs/components/prism-rust",
				"prismjs/components/prism-java",
				"prismjs/components/prism-c",
				"prismjs/components/prism-cpp",
				"prismjs/components/prism-csharp",
				"prismjs/components/prism-php",
			],
		},
		resolve: {
			alias: [],
		},
		server: {
			allowedHosts: [siteConfig.customDomain],
			// 开发环境把博客后端 API/上传静态资源代理到同源路径：
			// 浏览器端 BLOG_API_BASE 为空（请求 /api、/uploads），Cookie 同源写入/携带，
			// 避免 localhost 与 127.0.0.1 跨站导致 SameSite=Lax 会话 Cookie 失效。
			proxy: {
				"/api": {
					target: "http://127.0.0.1:3001",
					changeOrigin: true,
				},
				"/uploads": {
					target: "http://127.0.0.1:3001",
					changeOrigin: true,
				},
			},
		},
		build: {
			rollupOptions: {
				onwarn(warning, warn) {
					// temporarily suppress this warning
					if (
						warning.message.includes("is dynamically imported by") &&
						warning.message.includes("but also statically imported by")
					) {
						return;
					}
					warn(warning);
				},
			},
		},
	},
});
