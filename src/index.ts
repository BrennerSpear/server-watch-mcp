#!/usr/bin/env node

import { spawn } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Phase 2: Log storage types
interface LogEntry {
	timestamp: number;
	stream: "stdout" | "stderr";
	content: string;
}

// Phase 5a: In-memory log storage with circular buffer
const MAX_LOG_ENTRIES = 5000;
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

	// Phase 3: Add get_logs tool using the simpler Zod schema syntax
	server.tool(
		"get_logs",
		{
			limit: z.number().optional().default(100),
			stream: z.enum(["stdout", "stderr"]).optional(),
		},
		async ({ limit, stream }) => {
			// Filter logs by stream if specified
			const filteredLogs = stream
				? logs.filter((log) => log.stream === stream)
				: logs;

			// Get the most recent logs up to the limit
			const recentLogs = filteredLogs.slice(-limit);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(recentLogs, null, 2),
					},
				],
			};
		},
	);

	// Phase 3: Add search_logs tool using the simpler Zod schema syntax
	server.tool(
		"search_logs",
		{
			query: z.string(),
		},
		async ({ query }) => {
			const lowerQuery = query.toLowerCase();

			// Case-insensitive substring search
			const matchingLogs = logs.filter((log) =>
				log.content.toLowerCase().includes(lowerQuery),
			);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(matchingLogs, null, 2),
					},
				],
			};
		},
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

				// Phase 5a: Implement circular buffer - remove oldest entries if we exceed the limit
				if (logs.length > MAX_LOG_ENTRIES) {
					logs.shift(); // Remove the oldest entry
				}
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
			console.error(`Process terminated by signal: ${signal}`);
			process.exit(1);
		} else {
			if (code !== 0) {
				console.error(`Process exited with code: ${code}`);
			}
			process.exit(code ?? 0);
		}
	});

	// Phase 5b: Better command error handling
	child.on("error", (error) => {
		const nodeError = error as NodeJS.ErrnoException;

		if (nodeError.code === "ENOENT") {
			console.error(`Command not found: ${command}`);
			console.error(
				"Make sure the command is installed and available in your PATH",
			);
			process.exit(127);
		} else if (nodeError.code === "EACCES") {
			console.error(`Permission denied: ${command}`);
			console.error("Check that you have permission to execute this command");
			process.exit(126);
		} else {
			console.error(`Failed to start command '${command}': ${error.message}`);
			process.exit(127);
		}
	});
}

main().catch((error) => {
	console.error("Server failed to start:", error);
	process.exit(1);
});
