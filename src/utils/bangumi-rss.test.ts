import { describe, expect, it } from "vitest";
import { parseBangumiRss } from "./bangumi-rss";

const RSS_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
<title><![CDATA[的个人收藏]]></title>
<image>
<title><![CDATA[Bangumi 番组计划]]></title>
<link>http://bgm.tv</link>
<url>http://chii.in/img/logo_rc1.png</url>
</image>
<link>http://bgm.tv/user/1272604</link>
<language>zh-cn</language>
<description>在Bangumi最近的ACG收藏</description>
<ttl>720</ttl>
<item>
<title>在看:凡人修仙传 第五季</title>
<link>http://bgm.tv/subject/607915</link>
<description>
<![CDATA[
<a href="http://bgm.tv/subject/607915" title="凡人修仙传 第五季"><img src="//lain.bgm.tv/pic/cover/s/ac/c9/607915_RBL8u.jpg" alt="凡人修仙传 第五季" /></a>
]]>
</description>
<pubDate>Wed, 12 Aug 2026 03:33:21 +0000</pubDate>
<guid>http://bgm.tv/subject/607915</guid>
</item>
<item>
<title>想看:葬送的芙莉莲</title>
<link>http://bgm.tv/subject/408991</link>
<description>
<![CDATA[
<a href="http://bgm.tv/subject/408991" title="葬送的芙莉莲"><img src="//lain.bgm.tv/pic/cover/s/b3/d1/408991_rRLgE.jpg" alt="葬送的芙莉莲" /></a>
]]>
</description>
<pubDate>Wed, 12 Aug 2026 02:00:00 +0000</pubDate>
<guid>http://bgm.tv/subject/408991</guid>
</item>
</channel>
</rss>`;

describe("parseBangumiRss", () => {
	it("解析出每个条目的分类、条目 id、标题、封面与时间", () => {
		const items = parseBangumiRss(RSS_SAMPLE);

		expect(items).toHaveLength(2);

		expect(items[0]).toEqual({
			category: "在看",
			subjectId: "607915",
			title: "凡人修仙传 第五季",
			coverUrl: "https://lain.bgm.tv/pic/cover/s/ac/c9/607915_RBL8u.jpg",
			pubDate: "Wed, 12 Aug 2026 03:33:21 +0000",
		});

		expect(items[1]).toEqual({
			category: "想看",
			subjectId: "408991",
			title: "葬送的芙莉莲",
			coverUrl: "https://lain.bgm.tv/pic/cover/s/b3/d1/408991_rRLgE.jpg",
			pubDate: "Wed, 12 Aug 2026 02:00:00 +0000",
		});
	});

	it("空 feed 返回空数组", () => {
		const emptyRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><item></item></channel></rss>`;
		expect(parseBangumiRss(emptyRss)).toEqual([]);
	});

	it("解析标题含冒号的番名时不截断", () => {
		const rss = RSS_SAMPLE.replace("在看:凡人修仙传 第五季", "在看:重启人生：番外篇");
		const items = parseBangumiRss(rss);
		expect(items[0].category).toBe("在看");
		expect(items[0].title).toBe("重启人生：番外篇");
	});
});
