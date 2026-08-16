import { defineMiddleware } from "astro:middleware";

/**
 * CSP（Content-Security-Policy）安全头。
 *
 * 默认以 Content-Security-Policy-Report-Only 形式下发（不拦截，仅上报违规到
 * apiv2 /api/csp-report 端点）；设置环境变量 CSP_ENFORCE=1 后切换为强制模式。
 * 切换前请确认 report-only 日志中无 script/style 误伤。
 *
 * 注意：script-src 允许 'unsafe-inline' 是本站大量 is:inline 脚本的既有架构要求；
 * 白名单仍能拦截外部注入的远程脚本（防住大部分 XSS payload）。
 */
const CSP_POLICY: string = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline' https://giscus.app https://u.miscoke.top https://cdn.jsdelivr.net",
	"style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
	"img-src 'self' data: blob: https://img.miscoke.top https://p.miscoke.top https://i.miscoke.top https://avatars.githubusercontent.com https://cdn.jsdelivr.net",
	"font-src 'self' data: https://cdn.jsdelivr.net",
	"connect-src 'self' https://apiv2.miscoke.top https://t.miscoke.top https://u.miscoke.top https://i.miscoke.top https://e3.miscoke.top https://icon.miscoke.top https://b-live.miscoke.top https://giscus.app",
	"media-src 'self' blob: https://img.miscoke.top",
	"frame-src https://giscus.app",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'none'",
].join("; ");

export const onRequest: ReturnType<typeof defineMiddleware> = defineMiddleware(
	async (_context, next) => {
	const response = await next();
	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.includes("text/html")) {
		return response;
	}
	const enforce = process.env.CSP_ENFORCE === "1";
	const headerName = enforce
		? "Content-Security-Policy"
		: "Content-Security-Policy-Report-Only";
	const reportUri = enforce
		? ""
		: "; report-uri https://apiv2.miscoke.top/api/csp-report";
	response.headers.set(headerName, CSP_POLICY + reportUri);
	return response;
});
