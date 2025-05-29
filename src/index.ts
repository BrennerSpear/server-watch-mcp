#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

async function main() {
	const server = new McpServer({
		name: "server-watch-mcp",
		version: "1.0.0",
	});

	server.tool(
		"hello",
		{
			description: "Say hello to someone",
			inputSchema: {
				type: "object",
				properties: {
					name: {
						type: "string",
						description: "Name to greet",
						default: "World",
					},
				},
			},
		},
		async (params) => ({
			content: [
				{
					type: "text",
					text: `Hello, ${params.name || "World"}!`,
				},
			],
		}),
	);

	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main().catch((error) => {
	console.error("Server failed to start:", error);
	process.exit(1);
});
