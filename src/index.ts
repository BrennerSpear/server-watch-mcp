#!/usr/bin/env node

import { spawn } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
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

// Port configuration
const PORT = process.env.MCP_PORT
	? Number.parseInt(process.env.MCP_PORT, 10)
	: 3001;

// Store SSE transports for session management
const sseTransports: Record<string, SSEServerTransport> = {};

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

	// Set up Express app and Streamable HTTP transport
	const app = express();
	app.use(express.json());

	const transport = new StreamableHTTPServerTransport({
		sessionIdGenerator: undefined, // stateless for simplicity
	});

	// Modern Streamable HTTP endpoint
	app.post("/mcp", async (req, res) => {
		try {
			await transport.handleRequest(req, res, req.body);
		} catch (error) {
			console.error("Error handling MCP request:", error);
			if (!res.headersSent) {
				res.status(500).json({
					jsonrpc: "2.0",
					error: { code: -32603, message: "Internal server error" },
					id: null,
				});
			}
		}
	});

	// Legacy SSE endpoint for older clients
	app.get("/sse", async (req, res) => {
		try {
			const transport = new SSEServerTransport("/messages", res);
			sseTransports[transport.sessionId] = transport;

			res.on("close", () => {
				delete sseTransports[transport.sessionId];
			});

			await server.connect(transport);
		} catch (error) {
			console.error("Error setting up SSE transport:", error);
			if (!res.headersSent) {
				res.status(500).send("Failed to establish SSE connection");
			}
		}
	});

	// Legacy message endpoint for older clients
	app.post("/messages", async (req, res) => {
		try {
			const sessionId = req.query.sessionId as string;
			const transport = sseTransports[sessionId];
			if (transport) {
				await transport.handlePostMessage(req, res, req.body);
			} else {
				res.status(400).send("No transport found for sessionId");
			}
		} catch (error) {
			console.error("Error handling SSE message:", error);
			if (!res.headersSent) {
				res.status(500).send("Failed to handle message");
			}
		}
	});

	// Connect MCP server to transport
	await server.connect(transport);

	// Start HTTP server
	app.listen(PORT, () => {
		console.log(`MCP server running on http://localhost:${PORT}`);
		console.log(`Monitoring command: ${command} ${commandArgs.join(" ")}`);
	});

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
			console.error(`\nChild process terminated by signal: ${signal}`);
			console.log(`MCP server continues running on http://localhost:${PORT}`);
		} else {
			if (code !== 0) {
				console.error(`\nChild process exited with code: ${code}`);
			} else {
				console.log("\nChild process exited successfully");
			}
			console.log(`MCP server continues running on http://localhost:${PORT}`);
		}
	});

	// Phase 5b: Better command error handling
	child.on("error", (error) => {
		const nodeError = error as NodeJS.ErrnoException;

		if (nodeError.code === "ENOENT") {
			console.error(`\nCommand not found: ${command}`);
			console.error(
				"Make sure the command is installed and available in your PATH",
			);
		} else if (nodeError.code === "EACCES") {
			console.error(`\nPermission denied: ${command}`);
			console.error("Check that you have permission to execute this command");
		} else {
			console.error(`\nFailed to start command '${command}': ${error.message}`);
		}
		console.log(`\nMCP server continues running on http://localhost:${PORT}`);
	});
}

main().catch((error) => {
	console.error("Server failed to start:", error);
	process.exit(1);
});
