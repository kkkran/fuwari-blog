export const NO_SIDEBAR_ROUTE_PREFIXES: readonly string[] = [
	"/forum",
	"/tools",
	"/bangumi",
] as const;

export function isNoSidebarRoute(pathname: string): boolean {
	if (!pathname || pathname === "/") return false;
	return NO_SIDEBAR_ROUTE_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
	);
}
