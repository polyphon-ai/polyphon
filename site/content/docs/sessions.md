---
title: "Sessions"
weight: 90
description: "Start a session, send messages in broadcast or conductor-directed mode, continue multi-round conversations, and manage session history in Polyphon."
---

A **session** is a live conversation with one or more voices. This page covers how to start, use, and manage sessions.

---

## Starting a New Session

Click the **+** button at the top of the sidebar to open the new session panel.

![Sidebar showing the New Session (+) button at the top](/images/screenshots/sessions/new-button.webp)
<!-- Prerequisites: app open | Platform: any | Theme: any | Window: default -->

Select a saved composition from the list, give the session a name, optionally set a working directory, and click **Start Session**.

![New session panel showing composition picker, session name field, optional working directory field, and option to add voices manually](/images/screenshots/sessions/new-panel.webp)
<!-- Prerequisites: at least one saved composition | Platform: any | Theme: any | Window: default -->

### Working Directory

When creating a session you can optionally choose a working directory from your machine using the **Browse** button. If set:

- **CLI voices** (claude, codex, copilot) are spawned with that directory as their working directory.
- **All voices** receive the path in their ensemble system prompt so they have context about which project they are working in.

The working directory is shown in the session header next to the mode badge. It is stored encrypted and never leaves your machine.

### Sandboxing API Voices

When a working directory is set, a **Sandbox API voices to this directory** checkbox appears in the new session panel.

When enabled, all file path arguments from API voice tool calls are resolved relative to the working directory. Any path that would escape outside the directory (e.g. via `../`) is blocked. This limits API voice file access to the project you are working on.

The session header shows a green **Sandboxed** badge when sandboxing is active.

CLI voices are not affected — they run as autonomous subprocess agents and manage their own file access. If your composition includes CLI voices and you enable sandboxing, an amber warning explains this.

![New session panel with working directory path entered and Sandbox API voices checkbox visible](/images/screenshots/sessions/new-panel-sandbox-checkbox.webp)
<!-- Prerequisites: new session panel open, working directory field filled, sandbox checkbox visible | Platform: any | Theme: any | Window: default -->

![New session panel showing amber warning that CLI voices are not affected by sandboxing](/images/screenshots/sessions/new-panel-sandbox-cli-warning.webp)
<!-- Prerequisites: new session panel open, composition with CLI voice selected, working directory set, sandbox checkbox checked | Platform: any | Theme: any | Window: default -->

![Session header showing green Sandboxed badge, working directory path, and Broadcast mode badge](/images/screenshots/sessions/session-header-sandboxed.webp)
<!-- Prerequisites: active sandboxed session with a working directory set | Platform: any | Theme: any | Window: default -->

See [Filesystem Tools](../tools/) for details on the tools that can be sandboxed and how sandboxing works.

---

## The Session View

Once a session starts, you see the session view:

- **Message feed** — the full conversation history, with messages grouped by round. Each voice's messages show the voice's avatar icon and color.
- **Voice panel** — shows each active voice, its avatar icon, and its current status (waiting, generating, done, error)
- **Input bar** — where you type and send messages

![Full session view showing message feed with voice bubbles and markdown content, voice panel, and input bar](/images/screenshots/sessions/full-view.webp)
<!-- Prerequisites: active session with 2+ voices that have responded at least once with markdown content | Platform: any | Theme: any | Window: default -->

---

## Sending a Message

Type your message in the input bar at the bottom and press **Enter** (or **Shift+Enter** for a newline). Your message is sent to all active voices simultaneously.

Each voice's response streams in as it is generated. You can read responses as they arrive — you don't have to wait for all voices to finish before reading.

---

## Broadcast vs. Conductor-Directed Mode

Sessions have two modes, selectable from the voice panel header:

**Broadcast mode** — your message goes to every voice. This is the default.

**Conductor-directed mode** — direct your message to a specific voice. The other voices see the exchange but stay silent.

The current mode is shown as a badge in the session header: **Broadcast** or **Directed**.

![Session in conductor-directed mode with Directed badge and single voice highlighted](/images/screenshots/sessions/conductor-mode-voice-panel.webp)
<!-- Prerequisites: session open, conductor-directed mode active, a voice targeted | Platform: any | Theme: any | Window: default -->

### Targeting a voice in conductor-directed mode

There are two ways to target a voice in conductor-directed mode:

1. **Click the voice** in the voice panel. The selected voice is highlighted.
2. **Type `@` in the message input** to open a voice picker dropdown. The dropdown lists all active voices by display name. Select a voice from the dropdown to direct your next message to that voice; the voice panel updates to highlight the selection.

![@ mention voice picker dropdown open in conductor input showing active voice display names](/images/screenshots/sessions/at-mention-dropdown.webp)
<!-- Prerequisites: session in conductor-directed mode, @ typed in the input field | Platform: any | Theme: any | Window: default -->

---

## Continuation Rounds

The continuation policy is set on the composition, not on individual voices. It controls what happens after each round of responses. There are three modes:

**None** — voices respond once and wait. This is the default for new compositions.

**Prompt me** — after each round completes, a banner appears asking "Let the voices go another round without your input?" Click **Yes** to start the next round, or **Dismiss** to stop.

![Continuation nudge banner in session feed with Yes and Dismiss buttons](/images/screenshots/sessions/continuation-nudge.webp)
<!-- Prerequisites: session with Prompt me continuation policy, first round complete | Platform: any | Theme: any | Window: default -->

**Auto** — voices continue responding automatically up to the configured max rounds (1–3). A round divider appears in the message feed each time a new round starts.

![Session message feed showing round divider between round 1 and round 2 voice responses](/images/screenshots/sessions/continuation-round2.webp)
<!-- Prerequisites: session with Auto continuation, at least 2 rounds completed | Platform: any | Theme: any | Window: default -->

See [Compositions → Continuation Policy](../compositions/#continuation-policy) for how to configure these modes.

---

## Aborting a Response

If a voice is taking too long or you want to stop a response mid-stream, click the **Stop** button that appears next to the voice while it is generating.

---

## Exporting a Transcript

To save a copy of the session conversation, click the **Export** button in the session header. A dialog opens with three format options:

- **Markdown** — formatted text with speaker labels, timestamps, and fenced code blocks. Suitable for pasting into documents or viewing in any markdown reader.
- **JSON** — raw message data including metadata. Suitable for programmatic processing.
- **Plain text** — unformatted transcript without markup. Suitable for pasting into plain editors.

After selecting a format, a save dialog opens and you choose where to save the file on your machine.

> **Note:** Exported transcript files are not encrypted. The session content is written in plaintext to wherever you save it. Keep this in mind when sharing or storing transcripts that contain sensitive information.

![Transcript export modal showing Markdown, JSON, and Plain text format options with unencrypted note](/images/screenshots/sessions/export-modal.webp)
<!-- Prerequisites: active session with messages, export modal open | Platform: any | Theme: any | Window: default -->

---

## Session History

All messages in a session are saved automatically to your local database. To view past sessions, scroll through the sidebar — sessions are listed chronologically.

---

## Archiving Sessions

To hide a session from the sidebar without deleting it, right-click the session in the sidebar and select **Archive**. Archived sessions are not shown by default but can be retrieved if needed.

![Right-click context menu on a session showing Archive and Delete options](/images/screenshots/sessions/context-menu.webp)
<!-- Prerequisites: at least one session in the sidebar | Platform: any | Theme: any | Window: default -->
