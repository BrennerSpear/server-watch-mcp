# MCP Dev Server Monitor - Technical Specification

## Overview

A minimal command wrapper that captures development server output and exposes it via MCP (Model Context Protocol) for AI assistants. Zero configuration, minimal overhead.

## Problem Statement

Developers need AI assistants to understand what's happening with their development servers (errors, warnings, build output) without manually copying logs or setting up complex monitoring infrastructure.

## Solution

A simple command-line wrapper that:
1. Runs any development command as normal
2. Captures all output in memory
3. Provides MCP interface for AI assistants to query logs
4. Maintains zero impact on developer workflow

## Core Requirements

### Functional Requirements

**FR1: Command Wrapping**
- Accept any command and arguments
- Execute command as child process
- Forward all output to terminal in real-time with zero delay
- Preserve exit codes and signal handling
- Handle command-not-found errors gracefully

**FR2: Log Capture**
- Capture stdout and stderr streams separately
- Store logs in memory with timestamps
- Maintain circular buffer (5000 entries max)
- No persistence - logs exist only during execution

**FR3: MCP Integration** 
- Serve MCP over stdio transport
- Provide `get_logs` tool for retrieving recent logs
- Provide `search_logs` tool for text-based log search
- Return logs as JSON with timestamp, stream, and content

**FR4: Zero Configuration**
- No config files or setup required
- No port management or networking
- Work out-of-the-box with any command

### Non-Functional Requirements

**NFR1: Performance**
- Memory usage: <50MB total
- CPU overhead: <0.1% 
- Terminal output latency: 0ms (direct pipe)

**NFR2: Reliability**
- Handle process crashes gracefully
- Forward signals correctly (especially SIGINT/Ctrl+C)
- Clean shutdown on parent process termination

**NFR3: Compatibility**
- Support Node.js 18+
- Work on Windows, macOS, Linux
- Support any executable command

## Architecture

### High-Level Design

```
User Command → DevMonitor → Child Process
                    ↓            ↓
              MCP Server    Terminal Output
                    ↓
              AI Assistant
```

### Component Breakdown

**DevMonitor Class**
- Main orchestrator
- Manages child process lifecycle
- Handles log capture and storage
- Coordinates MCP server

**MCP Server**
- Implements MCP protocol over stdio
- Exposes log querying tools
- Handles tool execution requests

**Log Storage**
- In-memory circular buffer
- Simple append-only with size limits
- Indexed by timestamp for retrieval

### Data Models

**LogEntry**
```
{
  timestamp: number (Unix timestamp)
  stream: 'stdout' | 'stderr'
  content: string (single line)
}
```

**Tool Interfaces**

*get_logs*
- Input: `{ limit?: number, stream?: 'stdout'|'stderr' }`
- Output: Array of LogEntry objects
- Default limit: 100 entries

*search_logs*  
- Input: `{ query: string }`
- Output: Array of matching LogEntry objects
- Case-insensitive substring search

## Implementation Specifications

### Key Behaviors

**Process Management**
- Spawn child with inherited stdin, piped stdout/stderr
- Forward SIGINT to child process
- Exit with same code as child process
- Handle ENOENT (command not found) with exit code 127

**Stream Handling**
- Pipe child stdout/stderr directly to process stdout/stderr (zero latency)
- Split streams into lines for log storage
- Handle partial lines and end-of-stream correctly
- Preserve all output formatting

**MCP Protocol**
- Use StdioServerTransport for communication
- Implement tools/list and tools/call handlers
- Return structured JSON responses
- Handle errors gracefully with meaningful messages

### Error Handling

**Command Errors**
- Unknown command: Exit with code 127 and helpful message
- Permission errors: Pass through from child process
- Child crash: Exit with child's exit code

**MCP Errors**
- Unknown tool: Return error response with tool name
- Invalid arguments: Return validation error
- Internal errors: Log and return generic error response

## Usage Patterns

### Command Line Interface

```bash
# Basic usage
mcp-dev npm run dev
mcp-dev python manage.py runserver
```

### AI Assistant Integration

AI assistants connect via MCP and can:
- Query recent logs to understand current state
- Search for specific errors or warnings
- Monitor build output and compilation errors
- Track deployment status and server restarts

## Development & Distribution

### Build Process
- TypeScript compilation to ES modules
- Generate declaration files for npm consumers
- Include only `dist/` and documentation in package

### npm Package Configuration
- Proper module resolution with `main` and `types`
- Standard npm lifecycle scripts (build, test, prepublishOnly)
- Comprehensive package metadata for discoverability

### Quality Assurance
- TypeScript strict mode for type safety
- Biome for code consistency
- Basic smoke tests for CLI functionality
- Manual testing with common dev servers

## Success Metrics

**Developer Experience**
- Zero setup time (install and use immediately)
- No noticeable performance impact
- Works with existing development workflows

**AI Integration**
- AI assistants can understand dev server state
- Reduce time to diagnose build/runtime issues
- Enable proactive assistance based on log patterns

## Future Considerations

**Intentionally Excluded Features**
- Log persistence across sessions
- Advanced filtering or log levels
- Multiple simultaneous connections
- Configuration files or customization
- Network-based transport options

These exclusions maintain simplicity and focus on the core use case. If advanced features become necessary, they should be implemented as separate tools rather than complicating this minimal wrapper.