import type {
	GitHubEditConfig,
	ImageFallbackConfig,
	LicenseConfig,
	NavBarConfig,
	ProfileConfig,
	SiteConfig,
	UmamiConfig,
} from "./types/config";

const customDomain = "miscoke.top";
const serviceDomains = {
	tracker: `t.${customDomain}`,
	assets: `p.${customDomain}`,
	umami: `u.${customDomain}`,
	forum: `i.${customDomain}`,
	fileApi: `e3.${customDomain}`,
	iconMeta: `icon.${customDomain}`,
	liveStatus: `b-live.${customDomain}`,
};

export const serviceConfig = {
	trackerBaseUrl: `https://${serviceDomains.tracker}`,
	assetsBaseUrl: `https://${serviceDomains.assets}`,
	umamiBaseUrl: `https://${serviceDomains.umami}`,
	forumBaseUrl: `https://${serviceDomains.forum}`,
	fileApiBaseUrl: `https://${serviceDomains.fileApi}/api/`,
	iconMetaBaseUrl: `https://${serviceDomains.iconMeta}`,
	liveStatusUrl: `https://${serviceDomains.liveStatus}`,
};

export const siteConfig: SiteConfig = {
	customDomain,
	serviceDomains,
	title: "世界树栈",
	subtitle: "Shijie’s Nook",
	description:
		"世界树栈（Shijie’s Nook）是一个记录技术实验、AI 工作流、数字生活与长期写作的个人知识栈。",

	keywords: [
		"世界树栈",
		"Shijie’s Nook",
		"Shijie Nook",
		"miscoke",
		"技术写作",
		"AI 工作流",
		"数字花园",
		"博客",
		"Blog",
		"blog",
	],
	lang: "zh_CN", // 'en', 'zh_CN', 'zh_TW', 'ja', 'ko', 'es', 'th'
	themeColor: {
		hue: 165, // Default hue for the theme color, from 0 to 360. e.g. red: 0, teal: 200, cyan: 250, pink: 345
		fixed: true, // Hide the theme color picker for visitors
	},
	banner: {
		enable: false,
		src: "/xinghui.avif", // Relative to the /src directory. Relative to the /public directory if it starts with '/'

		position: "center", // Equivalent to object-position, only supports 'top', 'center', 'bottom'. 'center' by default
		credit: {
			enable: true, // Display the credit text of the banner image
			text: "Pixiv @chokei", // Credit text to be displayed

			url: "https://www.pixiv.net/artworks/122782209", // (Optional) URL link to the original artwork or artist's page
		},
	},
	background: {
		enable: false, // Enable background image
		src: "", // Background image URL (supports HTTPS)
		position: "center", // Background position: 'top', 'center', 'bottom'
		size: "cover", // Background size: 'cover', 'contain', 'auto'
		repeat: "no-repeat", // Background repeat: 'no-repeat', 'repeat', 'repeat-x', 'repeat-y'
		attachment: "fixed", // Background attachment: 'fixed', 'scroll', 'local'
		opacity: 1, // Background opacity (0-1)
	},
	toc: {
		enable: true, // Display the table of contents on the right side of the post
		depth: 2, // Maximum heading depth to show in the table, from 1 to 3
	},
	favicon: [
		// Leave this array empty to use the default favicon
		{
			src: "/favicon/shijies-nook.svg", // Path of the favicon, relative to the /public directory
			//   sizes: '32x32',              // (Optional) Size of the favicon, set only if you have favicons of different sizes
		},
	],
	officialSites: [
		{ url: `https://${customDomain}`, alias: "Main" },
	],
	server: [
		{ url: "", text: "Blog" },
		{ url: serviceConfig.umamiBaseUrl, text: "Umami" },
		{ url: serviceConfig.assetsBaseUrl, text: "Assets" },
	],
};

export const navBarConfig: NavBarConfig = {
	links: [
		{
			name: "博客",
			url: "/blog/",
			external: false,
			icon: "material-symbols:article-outline-rounded",
		},
		{
			name: "AI 生图",
			url: "/tools/gallery/",
			external: false,
			icon: "material-symbols:palette-outline-rounded",
		},
		{
			name: "追番",
			url: "/timetable/",
			external: false,
			icon: "material-symbols:play-circle-outline-rounded",
		},
		{
			name: "友链",
			url: "/friends/",
			external: false,
			icon: "material-symbols:link-rounded",
		},
		{
			name: "赞助",
			url: "/sponsors/",
			external: false,
			icon: "material-symbols:favorite-rounded",
		},
		{
			name: "工具",
			url: "/tools/",
			external: false,
			icon: "material-symbols:business-center-outline-rounded",
		},
	],
};

export const profileConfig: ProfileConfig = {
	avatar: "/favicon/shijies-nook.svg", // Relative to the /src directory. Relative to the /public directory if it starts with '/'
	name: "世界树栈",
	bio: "Shijie’s Nook · 写作、实验与工具存放处。",
	links: [
		{
			name: "GitHub",
			icon: "simple-icons:github",
			url: "https://github.com/miscoke",
		},
		{
			name: "RSS",
			icon: "material-symbols:rss-feed-rounded",
			url: "/rss.xml",
		},
	],
};

export const licenseConfig: LicenseConfig = {
	enable: true,
	name: "CC BY-NC-SA 4.0",
	url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
};

export const imageFallbackConfig: ImageFallbackConfig = {
	enable: false,
	originalDomain: `${serviceConfig.assetsBaseUrl}/pic?img=ua`,
	fallbackDomain: `${serviceConfig.assetsBaseUrl}/pic?img=ua`,
};

export const umamiConfig: UmamiConfig = {
	enable: true,
	baseUrl: serviceConfig.umamiBaseUrl,
	shareId: "CdkXbGgZr6ECKOyK",
	timezone: "Asia/Shanghai",
};

export const gitHubEditConfig: GitHubEditConfig = {
	enable: true,
	baseUrl: "https://github.com/miscoke/shijies-nook/blob/main/src/content/posts",
};

// todoConfig removed from here
