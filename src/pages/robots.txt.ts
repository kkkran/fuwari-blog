import type { APIRoute } from "astro";
import { buildRobotsTxt } from "@/utils/robots-utils";

export const GET: APIRoute = () => {
	return new Response(buildRobotsTxt(import.meta.env.SITE), {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
};
