import fs from "node:fs";
import path from "node:path";
import type { ParsedTimetableData } from "@/types/timetable";
import { parseTimetableText } from "@/utils/timetable-parser";

/** 课表文件缺失/读取失败时的降级空数据（避免拖垮整站渲染） */
const EMPTY_TIMETABLE: ParsedTimetableData = {
	config: { courseLen: 0, id: 0, name: "" },
	nodeTimes: [],
	meta: {
		id: 0,
		tableName: "",
		maxWeek: 0,
		nodes: 0,
		startDate: "",
		timeTable: 0,
	},
	courseDefinitions: [],
	arrangements: [],
};

export function parseTimetableFile(filePath: string): ParsedTimetableData {
	const absolutePath = path.isAbsolute(filePath)
		? filePath
		: path.join(process.cwd(), filePath);
	let rawText: string;
	try {
		rawText = fs.readFileSync(absolutePath, "utf-8");
	} catch {
		// 文件缺失（部署 cwd 不一致、数据文件被移除等）时降级为空课表，
		// 页面正常渲染，仅侧边栏课表不显示
		return EMPTY_TIMETABLE;
	}
	return parseTimetableText(rawText);
}
