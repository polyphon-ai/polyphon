**What's New**
- `poly sessions new --composition <id>` creates a session from the terminal, with optional `--name`, `--working-dir`, and `--sandbox` flags
- `poly status` now shows the poly and Polyphon versions, active client count, token fingerprint, remote access status, and per-provider CLI availability alongside API key status
- The API's `getStatus` response now includes active connection count and CLI tool availability per provider

**Improved**
- `make dev-poly` builds and globally links the poly CLI for local development; `make dev-poly-unlink` removes it
