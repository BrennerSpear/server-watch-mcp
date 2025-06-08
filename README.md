# server-watch-mcp

An MCP (Model Context Protocol) server that monitors and captures output from any running command. Perfect for development workflows where you need to access server logs, build output, or any process output through Claude.

## Features

- **HTTP-based MCP server** - Run as a standalone service that clients can connect to
- **Real-time log capture** - Captures stdout and stderr from any command
- **Circular buffer storage** - Maintains last 5000 log entries in memory
- **Two MCP tools**:
  - `get_logs` - Retrieve recent logs with optional filtering by stream type
  - `search_logs` - Search through logs with case-insensitive substring matching

## Installation

```bash
npm install -g server-watch-mcp
# or
pnpm add -g server-watch-mcp
```

## Usage

### 1. Start the MCP server with your command

```bash
# Monitor a development server
server-watch-mcp npm run dev

# Monitor a build process
server-watch-mcp npm run build:watch

# Monitor any command
server-watch-mcp python app.py
```

The server will:
- Start an HTTP server on port 3001 (or `MCP_PORT` environment variable)
- Execute your command as a child process
- Capture all output from the command
- Continue running even if the child process exits

### 2. Configure Claude Code

Create or update your `mcp.json` file in your Claude Code project:

```json
{
  "mcpServers": {
    "server-watch-mcp": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

### 3. Use the tools in Claude

Once connected, you can use these tools:

- **Get recent logs**: "Show me the last 50 logs from stderr"
- **Search logs**: "Search for any errors in the logs"
- **Monitor output**: "What's happening with my dev server?"

## Environment Variables

- `MCP_PORT` - Override the default port (3001)
  ```bash
  MCP_PORT=8080 server-watch-mcp npm run dev
  ```

## How it works

1. The server uses the MCP Streamable HTTP transport, allowing multiple clients to connect
2. Your command runs as a child process with its output piped to the MCP server
3. All output is stored in a circular buffer (max 5000 entries)
4. The HTTP server persists even if your command exits, maintaining access to logs

## Development

```bash
# Clone the repository
git clone https://github.com/yourusername/server-watch-mcp.git
cd server-watch-mcp

# Install dependencies
pnpm install

# Build
pnpm run build

# Run tests
pnpm test

# Run in development
pnpm run dev
```

## License

ISC