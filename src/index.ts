#!/usr/bin/env node

import { spawn } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Phase 2: Log storage types
interface LogEntry {
	timestamp: number;
	stream: "stdout" | "stderr";
	content: string;
}

// In-memory log storage
const logs: LogEntry[] = [];

async function main() {
	// Extract command and arguments from command line
	const args = process.argv.slice(2);
	if (args.length === 0) {
		console.error("Usage: server-watch-mcp <command> [args...]");
		console.error("Example: server-watch-mcp npm run dev");
		process.exit(1);
	}

	const command = args[0];
	const commandArgs = args.slice(1);

	// Initialize MCP server
	const server = new McpServer({
		name: "server-watch-mcp",
		version: "0.1.1",
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
					text: `MCP server is running! Monitoring command: ${command} ${commandArgs.join(" ")}\nLogs captured: ${logs.length}`,
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

	// Helper function to process and store log lines
	const processOutput = (data: Buffer, stream: "stdout" | "stderr") => {
		const text = data.toString();
		const lines = text.split("\n");

		for (const line of lines) {
			if (line.trim()) {
				// Store log entry
				logs.push({
					timestamp: Date.now(),
					stream,
					content: line,
				});
			}
		}

		// Still forward to stderr for visibility (temporary for Phase 2)
		process.stderr.write(data);
	};

	// Capture and forward child stdout
	if (child.stdout) {
		child.stdout.on("data", (data) => {
			processOutput(data, "stdout");
		});
	}

	// Capture and forward child stderr
	if (child.stderr) {
		child.stderr.on("data", (data) => {
			processOutput(data, "stderr");
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
