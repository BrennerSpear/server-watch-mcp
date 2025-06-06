#!/usr/bin/env node

import { spawn } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

async function main() {
	// Phase 1: Basic command wrapping
	// Extract command and arguments from command line
	const args = process.argv.slice(2);
	if (args.length === 0) {
		console.error("Usage: server-watch-mcp <command> [args...]");
		console.error("Example: server-watch-mcp npm run dev");
		process.exit(1);
	}

	const command = args[0];
	const commandArgs = args.slice(1);

	// Initialize MCP server (keeping it minimal for now)
	const server = new McpServer({
		name: "server-watch-mcp",
		version: "0.1.0",
	});

	// Keep a simple tool temporarily for testing MCP connection
	server.tool(
		"status",
		{
			description: "Check MCP server status",
			inputSchema: {
				type: "object",
				properties: {},
			},
		},
		async () => ({
			content: [
				{
					type: "text",
					text: `MCP server is running! Monitoring command: ${command} ${commandArgs.join(" ")}`,
				},
			],
		}),
	);

	// Start MCP server - it will use process.stdout for communication
	const transport = new StdioServerTransport();
	await server.connect(transport);

	// Spawn the child process with piped stdio so we can control where output goes
	const child = spawn(command, commandArgs, {
		stdio: ["inherit", "pipe", "pipe"], // stdin inherited, stdout/stderr piped
		shell: true,
		cwd: process.cwd(),
		env: process.env,
	});

	// Forward child stdout to stderr to avoid mixing with MCP protocol
	// This is a temporary solution for Phase 1 - we'll capture logs properly in Phase 2
	if (child.stdout) {
		child.stdout.on("data", (data) => {
			process.stderr.write(data);
		});
	}

	// Forward child stderr to process stderr
	if (child.stderr) {
		child.stderr.on("data", (data) => {
			process.stderr.write(data);
		});
	}

	// Handle child process exit
	child.on("exit", (code, signal) => {
		if (signal) {
			process.exit(1);
		} else {
			process.exit(code ?? 0);
		}
	});

	// Handle child process errors
	child.on("error", (error) => {
		console.error(`Failed to start command: ${error.message}`);
		process.exit(127);
	});
}

main().catch((error) => {
	console.error("Server failed to start:", error);
	process.exit(1);
});
