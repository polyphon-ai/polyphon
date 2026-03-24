---
title: "TCP API Server"
description: "Control a running Polyphon instance programmatically via its JSON-RPC 2.0 TCP server — for scripts, CI pipelines, and headless automation."
weight: 13
---

## Overview

Polyphon exposes a **JSON-RPC 2.0 over TCP** server that lets you control a running instance from scripts, terminals, CI pipelines, or any language with a TCP socket. The server is disabled by default and must be enabled in **Settings → TCP API Server**.

The easiest way to use the API is through the [`poly` CLI](./poly/), but any TCP client that speaks newline-delimited JSON can connect.

## Enabling the server

1. Open **Settings → TCP API Server**
2. Toggle the switch to enable
3. The status badge changes to **Running · port 7432** when the server is listening

The server binds to `127.0.0.1:7432` by default. This keeps it inaccessible from other machines.

### Remote Access

Enable **Remote Access** to bind to `0.0.0.0` (all interfaces). This makes the API reachable from other machines on your network.

> **Security warning:** Remote Access exposes the TCP server to your network. The bearer token is the only authentication mechanism. **You must add TLS termination** (nginx, Caddy, or similar) before exposing the API to untrusted networks.

## Wire protocol

Messages are **newline-delimited JSON-RPC 2.0** (NDJSON) over a plain TCP connection. Each message is a single UTF-8 JSON object terminated by `\n`.

Lines exceeding **1 MB** are rejected with error `-32700` and the connection is closed.

### Authentication handshake

Every connection must authenticate before calling any other method. Send `api.authenticate` as the first message:

```json
{"jsonrpc":"2.0","id":1,"method":"api.authenticate","params":{"token":"<64-char hex token>"}}
```

On success:
```json
{"jsonrpc":"2.0","id":1,"result":{"ok":true}}
```

On failure, the server returns error `-32001` and **closes the socket immediately**. Any non-`api.authenticate` method sent before authentication also returns `-32001` and closes the connection.

### Finding your token

The token is stored in `api.key` inside Polyphon's data directory:

The default path is `~/Library/Application Support/Polyphon/api.key`.

Override the path with the `POLYPHON_DATA_DIR` environment variable.

The **Settings → TCP API Server** section shows the last 8 hex characters of your token (fingerprint) for verification. The full token is never displayed in the UI.

### Standard request/response

```json
{"jsonrpc":"2.0","id":2,"method":"compositions.list","params":{}}
{"jsonrpc":"2.0","id":2,"result":[{"id":"...","name":"My Composition",...}]}
```

### Streaming (voice.broadcast / voice.ask)

When `stream: true` is set, the server sends `stream.chunk` notifications before the final result. Notifications carry the same `requestId` as the original request for correlation:

```json
{"jsonrpc":"2.0","id":3,"method":"voice.broadcast","params":{"sessionId":"...","content":"Explain TCP/IP","stream":true}}
{"jsonrpc":"2.0","method":"stream.chunk","params":{"requestId":3,"voiceId":"v1","voiceName":"Claude","delta":"TCP stands"}}
{"jsonrpc":"2.0","method":"stream.chunk","params":{"requestId":3,"voiceId":"v1","voiceName":"Claude","delta":" for Transmission"}}
{"jsonrpc":"2.0","method":"stream.chunk","params":{"requestId":3,"voiceId":"v2","voiceName":"GPT-4","delta":"The TCP "}}
{"jsonrpc":"2.0","id":3,"result":{"messages":[...]}}
```

Notifications have no `id` field. Multiple voice streams may interleave; use `voiceId` to separate them.

## Error codes

| Code | Meaning |
|------|---------|
| `-32700` | Parse error — invalid JSON or line exceeds 1 MB |
| `-32600` | Invalid request — malformed JSON-RPC envelope |
| `-32601` | Method not found |
| `-32602` | Invalid params |
| `-32603` | Internal error |
| `-32001` | Unauthorized — bad token, missing token, or pre-auth method |
| `-32002` | Not found — session or composition doesn't exist |
| `-32003` | Port conflict or server not running |

## Methods

### api.authenticate

Authenticate the connection. Must be called before any other method.

**Params:** `{ token: string }`
**Result:** `{ ok: true }`

### api.getStatus

Return the current server status.

**Params:** none
**Result:** `ApiStatus` object

```typescript
{
  enabled: boolean;           // persisted setting
  remoteAccessEnabled: boolean;
  running: boolean;           // currently listening
  port: number;
  host: string;               // '127.0.0.1' or '0.0.0.0'
  tokenFingerprint: string;   // last 8 hex chars — safe for logging
  version: string;            // app version
  startupError?: string;      // set when binding failed (e.g. EADDRINUSE)
}
```

### compositions.list

List all compositions.

**Params:** `{ archived?: boolean }` (default: `false`)
**Result:** `Composition[]`

### compositions.get

Get a single composition by ID.

**Params:** `{ id: string }`
**Result:** `Composition`
**Errors:** `-32002` if not found

### compositions.create

Create a new composition.

**Params:**
```typescript
{
  name: string;
  mode: 'broadcast' | 'conductor';
  continuationPolicy: 'none' | 'prompt' | 'auto';
  continuationMaxRounds: number;
  voices: CompositionVoice[];
}
```
**Result:** `Composition`

### compositions.update

Update a composition's fields or voices.

**Params:** `{ id: string, data: Partial<CompositionCreateParams> }`
**Result:** `Composition`
**Errors:** `-32002` if not found

### compositions.delete

Delete a composition.

**Params:** `{ id: string }`
**Result:** `{ ok: true }`

### compositions.archive

Archive or unarchive a composition.

**Params:** `{ id: string, archived: boolean }`
**Result:** `{ ok: true }`

### sessions.list

List all sessions.

**Params:** `{ archived?: boolean }` (default: `false`)
**Result:** `Session[]`

### sessions.get

Get a single session by ID.

**Params:** `{ id: string }`
**Result:** `Session`
**Errors:** `-32002` if not found

### sessions.create

Create a new session from a composition.

**Params:**
```typescript
{
  compositionId: string;
  name?: string;
  workingDir?: string;
  sandboxedToWorkingDir?: boolean;
}
```
**Result:** `Session`
**Errors:** `-32002` if composition not found

### sessions.delete

Delete a session and its messages.

**Params:** `{ id: string }`
**Result:** `{ ok: true }`

### sessions.rename

Rename a session.

**Params:** `{ id: string, name: string }`
**Result:** `Session`
**Errors:** `-32002` if not found

### sessions.archive

Archive or unarchive a session.

**Params:** `{ id: string, archived: boolean }`
**Result:** `{ ok: true }`

### sessions.messages

List all messages in a session.

**Params:** `{ sessionId: string }`
**Result:** `Message[]`
**Errors:** `-32002` if session not found

### sessions.export

Export a session transcript.

**Params:** `{ sessionId: string, format: 'markdown' | 'json' | 'plaintext' }`
**Result:** `{ content: string, format: string }`
**Errors:** `-32002` if session not found

### voice.broadcast

Send a message to all voices in a session.

**Params:**
```typescript
{
  sessionId: string;
  content: string;
  stream?: boolean;   // emit stream.chunk notifications if true
}
```
**Result:** `{ messages: Message[] }`

### voice.ask

Send a message to a single named voice.

**Params:**
```typescript
{
  sessionId: string;
  voiceId: string;
  content: string;
  stream?: boolean;
}
```
**Result:** `{ message: Message | null }`

### voice.abort

Abort the in-flight round for a session. Partial results already saved are preserved. If no round is in progress, this is a no-op.

**Params:** `{ sessionId: string }`
**Result:** `{ ok: true }`

### search.messages

Full-text search across all message content.

**Params:** `{ query: string, limit?: number, sessionId?: string }`
**Result:** `SearchResult[]`

### settings.getProviderStatus

Get the status of all configured voice providers.

**Params:** none
**Result:** `ProviderStatus[]`

### settings.getDebugInfo

Get debug information about the running instance.

**Params:** none
**Result:** debug info object

### mcp.getStatus

Get the current MCP server status.

**Params:** none
**Result:** `McpStatus`

### mcp.setEnabled

Enable or disable the MCP server.

**Params:** `{ enabled: boolean }`
**Result:** `McpStatus`

## Token rotation

Click **Rotate token** in Settings (requires a second click to confirm) to generate a new token. All active TCP connections are immediately disconnected. Reconnect using the new token from `api.key`.

## TLS with nginx

For remote access, terminate TLS with nginx (example):

```nginx
stream {
  server {
    listen 7433 ssl;
    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    proxy_pass 127.0.0.1:7432;
  }
}
```

Clients connect to `host:7433` over TLS; nginx forwards the raw TCP stream to `127.0.0.1:7432`.

## TLS with Caddy

```caddyfile
example.com:7433 {
  tls /path/to/cert.pem /path/to/key.pem
  reverse_proxy 127.0.0.1:7432
}
```

## Environment variables

| Variable | Purpose |
|----------|---------|
| `POLYPHON_DATA_DIR` | Override the directory where `api.key` is discovered |

## Quick start example (Python)

```python
import socket, json

def send(sock, obj):
    sock.sendall((json.dumps(obj) + '\n').encode())

def recv(sock):
    buf = b''
    while b'\n' not in buf:
        buf += sock.recv(4096)
    return json.loads(buf.split(b'\n')[0])

token = open('/Library/Application Support/Polyphon/api.key').read().strip()

s = socket.create_connection(('127.0.0.1', 7432))
send(s, {'jsonrpc':'2.0','id':1,'method':'api.authenticate','params':{'token':token}})
print(recv(s))  # {'jsonrpc':'2.0','id':1,'result':{'ok':True}}

send(s, {'jsonrpc':'2.0','id':2,'method':'compositions.list','params':{}})
print(recv(s))
s.close()
```
