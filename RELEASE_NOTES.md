**What's New**
- MCP Server: Polyphon can now run as an MCP tool server, letting AI agents (Claude, Codex, etc.) orchestrate your compositions programmatically
- Five MCP tools available: list compositions, create sessions, broadcast to all voices, ask a specific voice, and retrieve session history
- Run headlessly with `polyphon --mcp-server --headless` for use in agent workflows, or enable the in-process server from Settings → MCP Server
- New Settings tab to toggle the MCP server on/off with a live Running status indicator and connect instructions

**Improved**
- Session round execution refactored to support both GUI and headless modes without requiring a browser window
- Database passphrase and other runtime secrets are now redacted from logs
