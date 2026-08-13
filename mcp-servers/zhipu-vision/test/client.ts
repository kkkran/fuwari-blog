import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
	command: "node",
	args: ["dist/index.js"],
});

const client = new Client({
	name: "zhipu-vision-test-client",
	version: "1.0.0",
});

await client.connect(transport);

const image = process.argv[2] ?? "https://cdn.bigmodel.cn/static/logo/register.png";
const prompt = process.argv[3] ?? "这张图片上有什么？请用中文回答。";

const result = await client.callTool({
	name: "analyze_image",
	arguments: { image, prompt },
});

console.log(JSON.stringify(result, null, 2));

await client.close();
