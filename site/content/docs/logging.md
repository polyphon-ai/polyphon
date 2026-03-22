---
title: "Logging"
weight: 95
description: "View application logs, enable verbose debug logging, find the log file, and export it from Settings → Logs."
---

Polyphon writes diagnostic output to a single log file on disk. The **Settings → Logs** page lets you view recent entries, copy the file path, export it, and enable verbose debug logging.

---

## Log file

Polyphon writes one log file:

| File | Path |
|---|---|
| `polyphon.log` | `~/Library/Application Support/polyphon/logs/polyphon.log` |

The exact path for your system is shown on the **Settings → Logs** page with a copy button.

By default the log captures `info`, `warn`, and `error` level messages. When [debug logging](#debug-logging) is enabled it also captures `debug` level messages — in the same file.

### Log rotation

Polyphon automatically rotates log files to keep disk usage in check:

- Each log file grows up to **25 MB** before being rotated.
- Up to **5 files** are kept at any time (the active file plus four archives).
- Archive files are named `polyphon.1.log`, `polyphon.2.log`, and so on — `polyphon.1.log` is always the most recent archive.
- When a fifth archive would be created, the oldest is deleted automatically.

The **Export log** button exports only the current active file. To collect all recent logs, copy the archive files directly from the log directory.

---

## Viewing logs

The **Recent log entries** panel on Settings → Logs shows the last 500 lines of `polyphon.log`. Lines are colour-coded by level:

| Colour | Level |
|---|---|
| Red | `error` |
| Amber | `warn` |
| Sky blue | `info` |
| Gray | `debug` |

Click **Refresh** to reload the panel with the latest entries.

---

## Exporting the log

Click **Export log** on the Settings → Logs page. A save dialog opens — choose a location and file name, then click **Save**. Polyphon copies the current `polyphon.log` to the chosen path. The original file is not modified.

---

## Debug logging

Debug logging lowers the log level to `debug`, adding verbose internal output to the same `polyphon.log` file — voice lifecycle events, session routing decisions, shell environment loading, API key resolution (variable name only, never the value), and more.

> Debug logging produces significantly more output than normal. Enable it when troubleshooting a specific issue and disable it when you are done — the log file will grow quickly while it is active.

### Enable from Settings

1. Open **Settings → Logs**.
2. Toggle **Debug logging** on.

The change takes effect immediately — no restart required. A pulsing **Active** indicator appears next to the toggle label while debug logging is on.

### Enable manually (for crashes on startup)

If the app is crashing before you can reach Settings, you can enable debug logging by creating a flag file. Polyphon checks for this file on every launch before writing the first log entry.

```
touch ~/Library/Application\ Support/polyphon/debug.flag
```

To disable, delete the file. You can also disable it from the toggle in Settings — the toggle creates and removes this file automatically.

### Enable via environment variable

You can also set `POLYPHON_DEBUG=1` in your shell environment before launching the app. This takes priority over the flag file.

```sh
POLYPHON_DEBUG=1 open -a Polyphon
```

---

## Log sanitization

All output written to the log file is sanitized before being written to disk:

- Encrypted database field values are replaced with `[ENCRYPTED]`
- API keys and bearer tokens matching known patterns are replaced with `[REDACTED]`
- Fields from the encryption manifest (message content, your profile data, system prompts, CLI commands, custom provider URLs) are replaced with `[REDACTED]` when they appear as named object keys

Stack traces are only included in log output when debug logging is active.
