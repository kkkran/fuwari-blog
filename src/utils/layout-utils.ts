export const NO_SIDEBAR_ROUTE_PREFIXES: readonly string[] = [
	"/forum",
	"/tools",
	"/bangumi",
	// 登录/注册为专注操作场景，去掉左侧栏
	"/auth",
	// 博客后台：写文章/管理/审核均为专注操作场景，去掉左侧栏
	"/blog/new",
	"/blog/manage",
	"/blog/admin",
] as const;

export function isNoSidebarRoute(pathname: string): boolean {
	if (!pathname || pathname === "/") return false;
	return NO_SIDEBAR_ROUTE_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
	);
}
