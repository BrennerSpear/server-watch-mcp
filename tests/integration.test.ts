import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";

describe("Server Watch MCP Integration Tests", () => {
	let serverProcess: ChildProcess;
	const TEST_PORT = 3333; // Use a different port for tests to avoid conflicts

	afterEach(async () => {
		if (serverProcess) {
			serverProcess.kill();
			// Wait for process to exit
			await new Promise((resolve) => {
				serverProcess.on("exit", resolve);
				// Force kill after 2 seconds if it doesn't exit gracefully
				setTimeout(() => {
					if (!serverProcess.killed) {
						serverProcess.kill("SIGKILL");
						resolve(undefined);
					}
				}, 2000);
			});
		}
	});

	test("should start HTTP server and continue running when child exits", async () => {
		const serverPath = path.join(__dirname, "../dist/index.js");

		// Use the 'true' command which exits immediately with code 0
		serverProcess = spawn("node", [serverPath, "true"], {
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env, MCP_PORT: TEST_PORT.toString() },
		});

		// Capture both stdout and stderr to check messages
		let output = "";
		serverProcess.stdout?.on("data", (data) => {
			output += data.toString();
		});
		serverProcess.stderr?.on("data", (data) => {
			output += data.toString();
		});

		// Wait for server to start and child to exit
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Server should still be running
		expect(serverProcess.killed).toBe(false);
		expect(output).toContain(
			`MCP server running on http://localhost:${TEST_PORT}`,
		);
		expect(output).toContain("Child process exited successfully");
		expect(output).toContain("MCP server continues running");
	});

	test("should handle command not found error but keep server running", async () => {
		const serverPath = path.join(__dirname, "../dist/index.js");

		serverProcess = spawn("node", [serverPath, "nonexistent-command-12345"], {
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env, MCP_PORT: TEST_PORT.toString() },
		});

		// Capture both stdout and stderr to check messages
		let output = "";
		serverProcess.stdout?.on("data", (data) => {
			output += data.toString();
		});
		serverProcess.stderr?.on("data", (data) => {
			output += data.toString();
		});

		// Wait for error to occur
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Server should still be running despite command not found
		expect(serverProcess.killed).toBe(false);
		expect(output).toMatch(/Command not found|command not found/);
		expect(output).toContain("MCP server continues running");
	});

	test("should execute commands and capture output", async () => {
		const serverPath = path.join(__dirname, "../dist/index.js");

		serverProcess = spawn("node", [serverPath, "echo", "Hello World"], {
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env, MCP_PORT: TEST_PORT.toString() },
		});

		// Capture both stdout and stderr to check messages
		let output = "";
		serverProcess.stdout?.on("data", (data) => {
			output += data.toString();
		});
		serverProcess.stderr?.on("data", (data) => {
			output += data.toString();
		});

		// Wait for echo command to complete
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Server should still be running and output should be captured
		expect(serverProcess.killed).toBe(false);
		expect(output).toContain("Hello World");
		expect(output).toContain("Child process exited successfully");
	});

	test("should provide usage message when no arguments provided", async () => {
		const serverPath = path.join(__dirname, "../dist/index.js");

		serverProcess = spawn("node", [serverPath], {
			stdio: ["pipe", "pipe", "pipe"],
		});

		// Capture stderr for usage message
		let stderrOutput = "";
		serverProcess.stderr?.on("data", (data) => {
			stderrOutput += data.toString();
		});

		// Wait for the process to exit
		const exitCode = await new Promise<number>((resolve) => {
			serverProcess.on("exit", (code) => resolve(code || 0));
		});

		expect(exitCode).toBe(1);
		expect(stderrOutput).toContain("Usage: server-watch-mcp");
		expect(stderrOutput).toContain("Example: server-watch-mcp npm run dev");
	});

	test("should handle child process exit with non-zero code", async () => {
		const serverPath = path.join(__dirname, "../dist/index.js");

		serverProcess = spawn("node", [serverPath, "false"], {
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env, MCP_PORT: TEST_PORT.toString() },
		});

		// Capture both stdout and stderr to check messages
		let output = "";
		serverProcess.stdout?.on("data", (data) => {
			output += data.toString();
		});
		serverProcess.stderr?.on("data", (data) => {
			output += data.toString();
		});

		// Wait for child to exit
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Server should still be running despite child failure
		expect(serverProcess.killed).toBe(false);
		expect(output).toContain("Child process exited with code: 1");
		expect(output).toContain("MCP server continues running");
	});

	test("should make HTTP endpoint accessible", async () => {
		const serverPath = path.join(__dirname, "../dist/index.js");

		serverProcess = spawn(
			"node",
			[serverPath, "sleep", "10"], // Long-running command
			{
				stdio: ["pipe", "pipe", "pipe"],
				env: { ...process.env, MCP_PORT: TEST_PORT.toString() },
			},
		);

		// Wait for server to start
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Test HTTP endpoint
		try {
			const response = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					jsonrpc: "2.0",
					method: "tools/list",
					id: 1,
				}),
			});

			expect(response.ok).toBe(true);
			const data = await response.json();
			expect(data.jsonrpc).toBe("2.0");
			// Should list our tools
			expect(data.result.tools).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ name: "get_logs" }),
					expect.objectContaining({ name: "search_logs" }),
				]),
			);
		} catch (error) {
			// If fetch fails, it means the server isn't accessible
			throw new Error(`Failed to connect to server: ${error}`);
		}
	});
});
