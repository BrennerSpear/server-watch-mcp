import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";

describe("Server Watch MCP Integration Tests", () => {
	let serverProcess: ChildProcess;

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

	test("should handle command that exits with non-zero code", async () => {
		const serverPath = path.join(__dirname, "../dist/index.js");

		// Use the 'false' command which always exits with code 1
		serverProcess = spawn("node", [serverPath, "false"], {
			stdio: ["pipe", "pipe", "inherit"],
		});

		// Wait for the process to exit
		const exitCode = await new Promise<number>((resolve) => {
			serverProcess.on("exit", (code) => resolve(code || 0));
		});

		// Should exit with the same code as the child process
		expect(exitCode).toBe(1);
	});

	test("should handle command not found error", async () => {
		const serverPath = path.join(__dirname, "../dist/index.js");

		serverProcess = spawn("node", [serverPath, "nonexistent-command-12345"], {
			stdio: ["pipe", "pipe", "pipe"],
		});

		// Capture stderr to check error message
		let stderrOutput = "";
		serverProcess.stderr?.on("data", (data) => {
			stderrOutput += data.toString();
		});

		// Wait for the process to exit
		const exitCode = await new Promise<number>((resolve) => {
			serverProcess.on("exit", (code) => resolve(code || 0));
		});

		// Should exit with code 127 (command not found)
		expect(exitCode).toBe(127);
		expect(stderrOutput).toMatch(/Command not found|command not found/);
	});

	test("should execute commands and capture output", async () => {
		const serverPath = path.join(__dirname, "../dist/index.js");

		serverProcess = spawn("node", [serverPath, "echo", "Hello World"], {
			stdio: ["pipe", "pipe", "pipe"],
		});

		// Capture stderr (where child output is redirected)
		let stderrOutput = "";
		serverProcess.stderr?.on("data", (data) => {
			stderrOutput += data.toString();
		});

		// Wait for the process to exit
		const exitCode = await new Promise<number>((resolve) => {
			serverProcess.on("exit", (code) => resolve(code || 0));
		});

		// Should exit with code 0 (success) and capture output
		expect(exitCode).toBe(0);
		expect(stderrOutput).toContain("Hello World");
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

	test("should handle exit with code 1", async () => {
		const serverPath = path.join(__dirname, "../dist/index.js");

		serverProcess = spawn("node", [serverPath, "false"], {
			stdio: ["pipe", "pipe", "pipe"],
		});

		// Wait for the process to exit
		const exitCode = await new Promise<number>((resolve) => {
			serverProcess.on("exit", (code) => resolve(code || 0));
		});

		// Should exit with code 1 (failure)
		expect(exitCode).toBe(1);
	});
});
