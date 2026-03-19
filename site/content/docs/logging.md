---
title: "Logging"
weight: 95
description: "View application logs, enable verbose debug logging, copy log file paths, and export debug logs from the Settings → Logs page."
---

Polyphon writes diagnostic output to log files on disk. The **Settings → Logs** page lets you view recent log entries, enable debug logging, copy log file paths, and export debug logs for troubleshooting.

---

## Log files

Polyphon maintains two log files, both stored in the `logs/` subdirectory of the [app data directory](../settings/#data-location):

| File | When it exists | Contents |
|---|---|---|
| `polyphon.log` | Always | `info`, `warn`, and `error` level messages from the main process |
| `polyphon-debug.log` | When debug logging is enabled | All log levels including `debug` and `verbose` |

### Paths

| File | Path |
|---|---|
| `polyphon.log` | `~/Library/Application Support/polyphon/logs/polyphon.log` |
| `polyphon-debug.log` | `~/Library/Application Support/polyphon/logs/polyphon-debug.log` |

The exact path for your system is shown on the **Settings → Logs** page with a copy button.

---

## Viewing logs

The **Recent log entries** panel on Settings → Logs shows the last 500 lines of `polyphon.log`. Lines are colour-coded by level:

| Colour | Level |
|---|---|
| Red | `ERROR` |
| Amber | `WARN` |
| Sky blue | `INFO` |
| Gray | `DEBUG` / `VERBOSE` |

Click **Refresh** to reload the log viewer with the latest entries.

---

## Debug logging

Debug logging captures additional diagnostic output — verbose internal state, provider communication details, and other information not written to the standard log.

To enable it:

1. Open **Settings → Logs**.
2. Toggle **Debug logging** on.

The toggle takes effect immediately — no restart required. When active, a pulsing **Active** indicator appears next to the toggle label, and the debug log file path is shown below.

> Debug logging produces significantly more output than the standard log. Enable it when troubleshooting a specific issue and disable it when you are done.

---

## Copying a log path

Each log file entry on the Logs page includes a **copy** button. Click it to copy the full file path to your clipboard — useful for opening the file in a text editor or attaching it to a bug report.

---

## Exporting the debug log

When debug logging is enabled, an **Export** button appears below the debug log path.

1. Enable **Debug logging** to ensure the file exists and is being written.
2. Reproduce the issue you want to capture.
3. Click **Export**.
4. A save dialog opens — choose a location and file name, then click **Save**.

Polyphon copies the current `polyphon-debug.log` to the chosen path. The original file is not modified.

---

## Log sanitization

All output written to log files is sanitized before being written to disk. Sensitive values are never logged:

- Encrypted database field values are replaced with `[ENCRYPTED]`
- API keys and bearer tokens matching known patterns are replaced with `[REDACTED]`
- Fields from the encryption manifest (message content, your profile data, system prompts, CLI commands, custom provider URLs) are replaced with `[REDACTED]` when they appear as named object keys

Stack traces are only included when debug logging is active.
