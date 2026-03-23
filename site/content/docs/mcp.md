---
title: "MCP Server"
description: "Expose Polyphon as an MCP tool server so AI agents like Claude Code, Cursor, Codex CLI, and others can orchestrate multi-voice sessions programmatically."
weight: 12
---

## What is MCP?

The **Model Context Protocol (MCP)** is an open standard for connecting AI agents to external tools and data sources. When a host application (like Claude Code or Cursor) supports MCP, it can discover and call tools provided by any registered MCP server — exactly like calling a function in code, but from inside a conversation.

## Why it matters for Polyphon

With MCP support, Polyphon becomes a composable building block in AI-powered workflows. Instead of only being used through the desktop UI, Polyphon can be driven programmatically by any MCP-compatible agent:

- An agent can list all your saved compositions and pick the best one for a given task.
- It can create a session, broadcast a question to the entire ensemble, and get back all voice responses in one call.
- It can build persistent multi-turn context across multiple broadcasts.
- It can ask a specific named voice for a targeted opinion.
- It can retrieve the full session transcript for summarization or downstream analysis.

## Supported agents

Polyphon's MCP server works with any MCP-compatible client. Config snippets for major clients:

### Claude Code

```bash
claude mcp add polyphon -- /Applications/Polyphon.app/Contents/MacOS/Polyphon --mcp-server --headless
```

Or use `claude mcp add` with the full path to the binary on your system.

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "polyphon": {
      "command": "/Applications/Polyphon.app/Contents/MacOS/Polyphon",
      "args": ["--mcp-server", "--headless"]
    }
  }
}
```

### Codex CLI

Add to your Codex config (`~/.codex/config.json`):

```json
{
  "mcpServers": {
    "polyphon": {
      "command": "/Applications/Polyphon.app/Contents/MacOS/Polyphon",
      "args": ["--mcp-server", "--headless"]
    }
  }
}
```

### GitHub Copilot

Add to your VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcpServers": {
    "polyphon": {
      "command": "/Applications/Polyphon.app/Contents/MacOS/Polyphon",
      "args": ["--mcp-server", "--headless"]
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "polyphon": {
      "command": "/Applications/Polyphon.app/Contents/MacOS/Polyphon",
      "args": ["--mcp-server", "--headless"]
    }
  }
}
```

### Gemini CLI

Add to your Gemini CLI MCP config:

```json
{
  "mcpServers": {
    "polyphon": {
      "command": "/Applications/Polyphon.app/Contents/MacOS/Polyphon",
      "args": ["--mcp-server", "--headless"]
    }
  }
}
```

> **Note:** Replace `/Applications/Polyphon.app/Contents/MacOS/Polyphon` with the actual path to the Polyphon binary on your system. On macOS you can find it with `which polyphon` if the binary is in your PATH.

## CLI flags

| Flag | Description |
|---|---|
| `--mcp-server` | Start the MCP server. The app starts normally (GUI visible) unless combined with `--headless`. |
| `--headless` | Suppress the Electron window. The app runs as a background process serving MCP only. The process exits when the stdio transport closes. |

## Settings toggle

In **Settings → MCP Server**, a toggle lets you enable the MCP server so it auto-starts every time Polyphon launches — without needing to pass `--mcp-server` on the command line.

When the toggle is on, the status indicator shows "Running" and the connect command is displayed for easy copy-paste into your agent config.

> **Security note:** When the MCP server is enabled, any MCP agent that connects can invoke all tools enabled on your voices — including `write_file` and `run_command`. Only enable it if you trust the agents connecting to this server.

## Available tools

| Tool | Key inputs | Returns |
|---|---|---|
| `polyphon_list_compositions` | — | All non-archived compositions with voice summaries |
| `polyphon_create_session` | `compositionId`, `name?`, `workingDir?`, `sandboxedToWorkingDir?` | The created `Session` object |
| `polyphon_broadcast` | `sessionId`, `content` | `{ responses: [{ voiceName, content }], roundIndex }` |
| `polyphon_ask` | `sessionId`, `content`, `voiceName` | `{ voiceName, content, roundIndex }` |
| `polyphon_get_history` | `sessionId`, `limit?` | `{ session, messages }` |

## Security model

- **Stdio transport only** — no network port is opened. Only the process that spawned `polyphon --mcp-server` can communicate with it. OS process isolation provides the security boundary.
- **No auth layer** — this matches the security model of all local MCP servers (Claude Code's own server, Cursor's, etc.).
- **Tool capability inheritance** — `polyphon_broadcast` and `polyphon_ask` run inside a real session. If a voice has `write_file` or `run_command` enabled, those tools are available to the voice during the MCP-triggered round. Review your composition's tool settings before exposing a session via MCP.
- **Headless DB password** — if your Polyphon database is password-protected, set `POLYPHON_DB_PASSWORD` in the environment before launching in headless mode. The value is never written to logs.

## Example workflows

### 1. Quick ensemble sanity check

```
# In Claude Code after registering the MCP server:
> List my Polyphon compositions
# → sees "Code Review Panel", "Brainstorm Team", etc.

> Create a session from "Code Review Panel"
# → gets back a sessionId

> Broadcast "Review this function: [...]" to session abc-123
# → gets back responses from all voices in the panel
```

### 2. Targeted expert opinion

```
> Ask "Alice" in session abc-123: "What are the performance implications of this approach?"
# → gets back only Alice's response
```

### 3. Multi-turn research thread

```
# Create a session once, reuse it across multiple calls:
> Create session from "Research Team" → sessionId = xyz-456
> Broadcast "What are the main risks of LLM hallucination?" → [responses]
> Broadcast "How do retrieval-augmented systems address those risks?" → [responses]
> Get history for xyz-456 → full transcript for summarization
```
