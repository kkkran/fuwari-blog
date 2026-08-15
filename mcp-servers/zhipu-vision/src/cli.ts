import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_ENTRY = resolve(dirname(fileURLToPath(import.meta.url)), "index.js");

const TOOLS = ["analyze_image", "analyze_images", "analyze_video", "analyze_file"] as const;
type ToolName = (typeof TOOLS)[number];
type Thinking = "enabled" | "disabled" | "auto";

const USAGE = `用法：
  node dist/cli.js <输入> [提示词] [选项]

  <输入>        图片/视频/文件：http(s) URL、base64（含 data: URI）或本地文件路径
  提示词        对媒体的提问或指令（可选，默认：请详细描述内容）
  选项：
    --tool <名称>       analyze_image | analyze_images | analyze_video | analyze_file（默认 analyze_image）
    --thinking <模式>   enabled | disabled | auto（默认 auto，深度思考）
    --json              以 JSON 输出完整结果

  示例：
  node dist/cli.js "D:/photos/a.png"
  node dist/cli.js "https://example.com/a.png" "图中有几只猫？"
  node dist/cli.js "D:/photos/a.png" --thinking disabled --tool analyze_image
  node dist/cli.js "D:/a.png" "D:/b.png" --tool analyze_images --prompt "对比这两张图"
`;

interface Options {
	tool: ToolName;
	thinking: Thinking;
	json: boolean;
	prompt?: string;
	positionals: string[];
}

function fail(message: string): never {
	console.error(`错误：${message}`);
	process.exit(1);
}

function parseArgs(argv: string[]): Options {
	const options: Options = {
		tool: "analyze_image",
		thinking: "auto",
		json: false,
		positionals: [],
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--tool") {
			const value = argv[++i];
			if (!value || !(TOOLS as readonly string[]).includes(value)) {
				fail(`无效的 --tool：${value}（可选：${TOOLS.join(" | ")}）`);
			}
			options.tool = value as ToolName;
		} else if (arg === "--thinking") {
			const value = argv[++i];
			if (value !== "enabled" && value !== "disabled" && value !== "auto") {
				fail(`无效的 --thinking：${value}（可选：enabled | disabled | auto）`);
			}
			options.thinking = value;
		} else if (arg === "--prompt") {
			const value = argv[++i];
			if (value === undefined) {
				fail("--prompt 缺少参数值");
			}
			options.prompt = value;
		} else if (arg === "--json") {
			options.json = true;
		} else if (arg === "--help" || arg === "-h") {
			console.log(USAGE);
			process.exit(0);
		} else if (arg.startsWith("-")) {
			fail(`未知选项：${arg}\n\n${USAGE}`);
		} else {
			options.positionals.push(arg);
		}
	}
	return options;
}

function buildArguments(options: Options): Record<string, unknown> {
	const prompt = options.prompt ?? options.positionals[1];
	switch (options.tool) {
		case "analyze_image":
		case "analyze_video":
		case "analyze_file": {
			const input = options.positionals[0];
			if (!input) {
				fail(`工具 ${options.tool} 需要一个媒体输入（URL / base64 / 本地路径）`);
			}
			const key = options.tool === "analyze_image" ? "image" : options.tool === "analyze_video" ? "video" : "file";
			return { [key]: input, prompt: prompt ?? "请详细描述这个媒体的内容。", thinking: options.thinking };
		}
		case "analyze_images": {
			const images = options.positionals;
			if (images.length < 1) {
				fail("工具 analyze_images 至少需要一张图片");
			}
			return {
				images,
				prompt: prompt ?? "请详细描述这些图片的内容。",
				thinking: options.thinking,
			};
		}
	}
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const transport = new StdioClientTransport({
		command: "node",
		args: [SERVER_ENTRY],
	});
	const client = new Client({ name: "zhipu-vision-cli", version: "1.0.0" });
	try {
		await client.connect(transport);
		const raw = await client.callTool({
			name: options.tool,
			arguments: buildArguments(options),
		});
		const result = raw as {
			content?: Array<{ type: string; text?: string }>;
			isError?: boolean;
		};
		const text = (result.content ?? [])
			.filter((part) => part.type === "text")
			.map((part) => part.text ?? "")
			.join("\n");
		if (options.json) {
			console.log(JSON.stringify(result, null, 2));
		} else if (text) {
			console.log(text);
		} else if (result.isError) {
			fail("MCP 工具调用返回错误，未包含可读文本");
		}
	} catch (error) {
		fail(error instanceof Error ? error.message : String(error));
	} finally {
		await client.close();
	}
}

main();
