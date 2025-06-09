import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";

describe("Server Watch MCP Integration Tests", () => {
	jest.setTimeout(10000); // Set timeout to 10 seconds
	let serverProcess: ChildProcess;
	let testPort: number;

	beforeEach(() => {
		// Use a random port for each test to avoid conflicts
		testPort = 3000 + Math.floor(Math.random() * 1000);
	});

	afterEach(async () => {
		if (serverProcess && !serverProcess.killed) {
			serverProcess.kill("SIGTERM");

			// Give it a chance to exit gracefully
			const exitPromise = new Promise((resolve) => {
				serverProcess.once("exit", resolve);
			});

			const timeoutPromise = new Promise((resolve) => {
				setTimeout(() => {
					if (!serverProcess.killed) {
						serverProcess.kill("SIGKILL");
					}
					resolve(undefined);
				}, 1000);
			});

			await Promise.race([exitPromise, timeoutPromise]);
		}
	});

	test("should start HTTP server and continue running when child exits", async () => {
		const serverPath = path.join(__dirname, "../dist/index.js");

		// Use the 'true' command which exits immediately with code 0
		serverProcess = spawn("node", [serverPath, "true"], {
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env, SERVER_WATCH_MCP_PORT: testPort.toString() },
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
			`MCP server running on http://localhost:${testPort}`,
		);
		expect(output).toContain("Child process exited successfully");
		expect(output).toContain("MCP server continues running");
	});

	test("should handle command not found error but keep server running", async () => {
		const serverPath = path.join(__dirname, "../dist/index.js");

		serverProcess = spawn(
			"node",
			[serverPath, "definitely-not-a-real-command-xyz123"],
			{
				stdio: ["pipe", "pipe", "pipe"],
				env: { ...process.env, SERVER_WATCH_MCP_PORT: testPort.toString() },
			},
		);

		// Capture both stdout and stderr to check messages
		let output = "";
		serverProcess.stdout?.on("data", (data) => {
			output += data.toString();
		});
		serverProcess.stderr?.on("data", (data) => {
			output += data.toString();
		});

		// Wait for error to occur and messages to be printed
		await new Promise((resolve) => setTimeout(resolve, 5000));

		// Check that command not found error was reported
		expect(output).toMatch(/Command not found|command not found/);
		expect(output).toContain("MCP server continues running");
	});

	test("should execute commands and capture output", async () => {
		const serverPath = path.join(__dirname, "../dist/index.js");

		serverProcess = spawn("node", [serverPath, "echo", "Hello World"], {
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env, SERVER_WATCH_MCP_PORT: testPort.toString() },
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
			env: { ...process.env, SERVER_WATCH_MCP_PORT: testPort.toString() },
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

	test("should start server on random port", async () => {
		const serverPath = path.join(__dirname, "../dist/index.js");

		serverProcess = spawn(
			"node",
			[serverPath, "echo", "test"], // Simple command
			{
				stdio: ["pipe", "pipe", "pipe"],
				env: { ...process.env, SERVER_WATCH_MCP_PORT: testPort.toString() },
			},
		);

		// Capture output to verify server started
		let output = "";

		serverProcess.stdout?.on("data", (data) => {
			output += data.toString();
		});
		serverProcess.stderr?.on("data", (data) => {
			output += data.toString();
		});

		// Wait for server to start and echo to complete
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Verify server started on the correct port
		expect(output).toContain(
			`MCP server running on http://localhost:${testPort}`,
		);

		// Verify echo command output was captured
		expect(output).toContain("test");

		// Verify server continues running message
		expect(output).toContain("MCP server continues running");
	});
});
