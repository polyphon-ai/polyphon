---
title: "Sessions"
weight: 40
description: "Start a session, send messages in broadcast or conductor-directed mode, continue multi-round conversations, and manage session history in Polyphon."
---

A **session** is a live conversation with one or more voices. This page covers how to start, use, and manage sessions.

---

## Starting a New Session

Click the **+** button at the top of the sidebar to open the new session panel.

![Sidebar showing the New Session (+) button at the top](/images/screenshots/sessions/new-button.webp)
<!-- Prerequisites: app open | Platform: any | Theme: any | Window: default -->

You can start a session in two ways:

1. **From a composition** — select a saved composition and click **Start Session**. The session launches with the composition's voices pre-configured.
2. **Ad-hoc** — add voices manually without a composition. Configure each voice's provider, model, name, and system prompt inline.

![New session panel showing composition picker and option to add voices manually](/images/screenshots/sessions/new-panel.webp)
<!-- Prerequisites: at least one saved composition | Platform: any | Theme: any | Window: default -->

---

## The Session View

Once a session starts, you see the session view:

- **Message feed** — the full conversation history, with messages grouped by round. Each voice's messages show the voice's avatar icon and color.
- **Voice panel** — shows each active voice, its avatar icon, and its current status (waiting, generating, done, error)
- **Input bar** — where you type and send messages

![Full session view showing message feed with voice bubbles, voice panel, and input bar](/images/screenshots/sessions/full-view.webp)
<!-- Prerequisites: active session with 2+ voices that have responded at least once | Platform: any | Theme: any | Window: default -->

---

## Sending a Message

Type your message in the input bar at the bottom and press **Enter** (or **Shift+Enter** for a newline). Your message is sent to all active voices simultaneously.

Each voice's response streams in as it is generated. You can read responses as they arrive — you don't have to wait for all voices to finish before reading.

{{< video src="/videos/docs/sessions-streaming.mp4" poster="/images/video-posters/docs/sessions-streaming.webp" >}}

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

{{< video src="/videos/docs/sessions-at-mention.mp4" poster="/images/video-posters/docs/sessions-at-mention.webp" >}}

---

## Continuation Rounds

The continuation policy is set on the composition, not on individual voices. It controls what happens after each round of responses. There are three modes:

**None** — voices respond once and wait. This is the default for new compositions.

**Prompt me** — after each round completes, a nudge banner appears at the bottom of the message feed asking whether to continue:

{{< video src="/videos/docs/continuation-nudge.mp4" poster="/images/video-posters/docs/continuation-nudge.webp" >}}

Click **Allow** to start the next round, or **Dismiss** to stop without continuing.

**Auto** — voices continue responding automatically up to the configured max rounds (1–3). A round divider appears in the message feed each time a new round starts.

See [Compositions → Continuation Policy](../compositions/#continuation-policy) for how to configure these modes.

---

## Aborting a Response

If a voice is taking too long or you want to stop a response mid-stream, click the **Stop** button that appears next to the voice while it is generating.

---

## Session History

All messages in a session are saved automatically to your local database. To view past sessions, scroll through the sidebar — sessions are listed chronologically.

---

## Archiving Sessions

To hide a session from the sidebar without deleting it, right-click the session in the sidebar and select **Archive**. Archived sessions are not shown by default but can be retrieved if needed.

![Right-click context menu on a session showing Archive and Delete options](/images/screenshots/sessions/context-menu.webp)
<!-- Prerequisites: at least one session in the sidebar | Platform: any | Theme: any | Window: default -->
