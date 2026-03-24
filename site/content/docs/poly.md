---
title: "poly CLI"
description: "A standalone command-line tool for controlling a running Polyphon instance from your terminal, scripts, and CI pipelines."
weight: 14
---

## Overview

`poly` is a standalone Node.js CLI for controlling a running Polyphon instance from your terminal. It communicates with Polyphon's [TCP API Server](./api/) over a local socket.

For local use, `poly` discovers the authentication token automatically — no configuration required. For remote use, point it at any Polyphon instance with a few environment variables or a named remote.

## Installation

```bash
npm install -g @polyphon-ai/poly
```

Or run without installing:

```bash
npx @polyphon-ai/poly status
```

## Requirements

- **Polyphon must be running** with the TCP API Server enabled (Settings → TCP API Server)
- Node.js 18 or later

## Quick start

```bash
# Check that Polyphon is running and the server is reachable
poly status

# List your saved compositions
poly compositions list

# Start a broadcast and stream tokens to the terminal
poly run --composition <id> --prompt "Summarize the key trade-offs of microservices" --stream

# List recent sessions
poly sessions list

# Export a session as markdown
poly sessions export <session-id> --format markdown > transcript.md
```

## Connection

`poly` resolves the connection in this order:

1. **Named remote** (`--remote <name>`): reads `~/.config/poly/remotes.json`
2. **Environment variables** (`POLYPHON_HOST` set): uses `POLYPHON_HOST:POLYPHON_PORT` with token from `POLYPHON_TOKEN` or `POLYPHON_TOKEN_FILE`
3. **Local auto-discovery** (default): connects to `127.0.0.1:7432` and reads the token from the platform-specific data directory

### Local token path

The default path is `~/Library/Application Support/Polyphon/api.key`.

Override with `POLYPHON_DATA_DIR`:

```bash
POLYPHON_DATA_DIR=/custom/path poly status
```

### Remote connection

```bash
# Using environment variables
export POLYPHON_HOST=laptop.local
export POLYPHON_PORT=7432
export POLYPHON_TOKEN=$(cat ~/polyphon-token.key)
poly status

# Or with a token file
export POLYPHON_HOST=laptop.local
export POLYPHON_TOKEN_FILE=~/polyphon-token.key
poly status
```

### Named remotes

```bash
# Add a named remote
poly remote add work --host laptop.local --port 7432 --token-file ~/work.key

# Use it
poly --remote work status
poly --remote work compositions list
```

## Commands

### poly status

Show Polyphon version, API server status, MCP status, and provider statuses.

```bash
poly status
poly status --format json
```

### poly compositions

Manage saved compositions.

```bash
poly compositions list
poly compositions list --format json
poly compositions get <id>
poly compositions get <id> --format json
```

### poly sessions

Manage conversation sessions.

```bash
poly sessions list
poly sessions list --archived
poly sessions get <id>
poly sessions messages <id>
poly sessions export <id> --format markdown
poly sessions export <id> --format json
poly sessions export <id> --format plaintext
poly sessions rename <id> "New name"
poly sessions delete <id>
```

### poly run

Broadcast a message to all voices in a session. Creates a session if `--composition` is given instead of `--session`.

```bash
# Broadcast to an existing session
poly run --session <id> --prompt "What are the trade-offs here?"

# Create a session from a composition and broadcast
poly run --composition <id> --prompt "Hello ensemble"

# Stream tokens as they arrive
poly run --session <id> --prompt "Write a haiku" --stream

# Output all voice responses as JSON
poly run --session <id> --prompt "Explain monads" --format json
```

### poly ask

Send a message to a single named voice.

```bash
poly ask --session <id> --voice <voiceId> --prompt "What do you think?"
poly ask --session <id> --voice <voiceId> --prompt "Elaborate" --stream
```

### poly search

Full-text search across all session messages.

```bash
poly search "TCP framing"
poly search "microservices" --limit 20
poly search "react hooks" --format json
```

### poly remote

Manage named remote connections stored in `~/.config/poly/remotes.json`.

```bash
poly remote list
poly remote add <name> --host <host> --port <port> --token-file <path>
poly remote remove <name>
```

## Output formats

All commands support `--format`:

| Format | Description |
|--------|-------------|
| (default) | Human-readable table or plain text |
| `json` | JSON — one object or array per command; suitable for `jq` piping |

```bash
# Pipe to jq
poly compositions list --format json | jq '.[].name'
poly sessions list --format json | jq '.[] | select(.archived == false) | .name'
```

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Connection error, authentication failure, or command error |

On error, `poly` prints a human-readable message to stderr. With `--format json`, errors are also printed as a JSON object to stderr:

```json
{"error": "Connection refused — is the TCP API Server enabled in Polyphon?"}
```

## CI/pipeline usage

```bash
# Check Polyphon is up before running further steps
poly status --format json | jq -e '.running == true'

# Run a composition and capture output
RESULT=$(poly run --composition $COMP_ID --prompt "$PROMPT" --format json)
echo "$RESULT" | jq '.messages[].content'
```

Use `POLYPHON_TOKEN_FILE` to avoid putting the token in command-line arguments or environment variables visible in process listings:

```bash
# In CI: store token as a secret, write to a temp file
echo "$POLYPHON_TOKEN_SECRET" > /tmp/poly.key
chmod 600 /tmp/poly.key
export POLYPHON_TOKEN_FILE=/tmp/poly.key
export POLYPHON_HOST=polyphon.internal
poly status
```

## Environment variables

| Variable | Purpose |
|----------|---------|
| `POLYPHON_HOST` | Remote host (overrides local auto-discovery) |
| `POLYPHON_PORT` | Remote port (default: `7432`) |
| `POLYPHON_TOKEN` | Token value for remote connection |
| `POLYPHON_TOKEN_FILE` | Path to a file containing the token |
| `POLYPHON_DATA_DIR` | Override local data directory for `api.key` discovery |

## Security

- The token is read from a file or environment variable — it is never passed as a command-line argument by `poly` itself
- Token values never appear in `poly` error output
- For remote connections, add TLS termination at the network layer (nginx, Caddy) — see [TCP API Server → TLS](./api/#tls-with-nginx)
- `api.key` is written with mode `0600`
