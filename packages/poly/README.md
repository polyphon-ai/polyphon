# poly

CLI for controlling a running [Polyphon](https://polyphon.ai) instance.

`poly` connects to Polyphon's TCP API server and lets you manage compositions,
sessions, and conversations from the terminal — locally or over a network.

## Requirements

- [Polyphon](https://polyphon.ai) must be running with the TCP API server enabled
  (Settings → API Server, or launch with `--api-server`)
- Node.js 18 or later

## Installation

```sh
npm install -g @polyphon-ai/poly
```

## Local usage

When Polyphon is running on the same machine, `poly` connects automatically —
no configuration needed.

```sh
poly status
poly compositions list
poly sessions list
```

## Commands

### `poly status`

Show the status of the running Polyphon instance including version, API server
info, MCP status, and provider availability.

---

### `poly compositions list`

List all compositions.

```sh
poly compositions list
poly compositions list --archived
poly compositions list --format json
```

### `poly compositions get <id>`

Get a single composition by ID.

```sh
poly compositions get abc123
poly compositions get abc123 --format json
```

---

### `poly sessions list`

List all sessions.

```sh
poly sessions list
poly sessions list --archived
poly sessions list --format json
```

### `poly sessions get <id>`

Get a single session by ID.

```sh
poly sessions get abc123
```

### `poly sessions messages <sessionId>`

List all messages in a session.

```sh
poly sessions messages abc123
poly sessions messages abc123 --format json
```

### `poly sessions export <sessionId>`

Export a session transcript.

```sh
poly sessions export abc123
poly sessions export abc123 --format-output json
poly sessions export abc123 --format-output plaintext
```

---

### `poly run`

Broadcast a prompt to all voices in a session.

```sh
poly run --session <id> --prompt "Review this approach"
poly run --session <id> --prompt "Review this approach" --stream
poly run --session <id> --prompt "Review this approach" --format json
```

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `--session <id>` | Session ID (required) | — |
| `--prompt <text>` | Message to broadcast (required) | — |
| `--stream` | Stream tokens as they arrive | false |
| `--format <format>` | Output format: `human` or `json` | `human` |

---

### `poly ask`

Send a directed message to a specific voice in a session.

```sh
poly ask --session <id> --voice <id> --prompt "What do you think?"
poly ask --session <id> --voice <id> --prompt "What do you think?" --stream
```

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `--session <id>` | Session ID (required) | — |
| `--voice <id>` | Voice ID (required) | — |
| `--prompt <text>` | Message to send (required) | — |
| `--stream` | Stream tokens as they arrive | false |
| `--format <format>` | Output format: `human` or `json` | `human` |

---

### `poly search <query>`

Search across all session messages.

```sh
poly search "authentication bug"
poly search "authentication bug" --format json
```

---

### Remote connections

`poly` connects to `127.0.0.1:7432` by default. To connect to a remote
Polyphon instance, use named remotes or environment variables.

#### Named remotes

```sh
# Add a remote (token-file must contain the api.key from the remote machine)
poly remote add home-server --host 192.168.1.10 --token-file ~/.polyphon/home.key

# List remotes
poly remote list

# Remove a remote
poly remote remove home-server

# Use a remote for any command
poly --remote home-server compositions list
poly --remote home-server run --session <id> --prompt "Hello"
```

#### Environment variables

```sh
export POLYPHON_HOST=192.168.1.10
export POLYPHON_PORT=7432
export POLYPHON_TOKEN_FILE=~/.polyphon/home.key

poly compositions list
```

| Variable | Description |
|----------|-------------|
| `POLYPHON_HOST` | Remote hostname or IP |
| `POLYPHON_PORT` | Remote port (default: `7432`) |
| `POLYPHON_TOKEN` | API token string (avoid — prefer token file) |
| `POLYPHON_TOKEN_FILE` | Path to file containing the API token |
| `POLYPHON_DATA_DIR` | Override default app data directory for local token lookup |

> **Note:** Never pass the token as a CLI argument — use a file or environment
> variable to keep it out of shell history and process listings.

## Security

Remote access should be placed behind a TLS-terminating reverse proxy (nginx,
Caddy) when exposed over a network. The TCP API server does not provide TLS
on its own.

## License

MIT — see [LICENSE](./LICENSE)
