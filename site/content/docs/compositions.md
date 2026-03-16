---
title: "Compositions"
weight: 30
description: "Create and manage compositions — named, reusable sets of voices for launching consistent multi-voice sessions in Polyphon."
---

A **composition** is a saved, named configuration of voices. Create one to quickly launch consistent multi-voice sessions without reconfiguring voices each time.

---

## Creating a Composition

Click the **New Composition** button in the sidebar (below the session list).

![Sidebar showing the New Composition button below the session list](/images/screenshots/compositions/sidebar-new-button.webp)
<!-- Prerequisites: app open with at least one session visible | Platform: any | Theme: any | Window: default -->

The composition builder opens. Give your composition a name, then add voices.

![Composition Builder in empty state with name field, mode selector, and Add Voice button](/images/screenshots/compositions/builder-empty.webp)
<!-- Prerequisites: newly opened Composition Builder | Platform: any | Theme: any | Window: default -->

---

## Choosing a Mode

The first setting in the Composition Builder is the session mode. This controls how your messages are dispatched when you start a session from this composition.

| Mode | Behavior |
|---|---|
| **Conductor-Directed** | You direct each message to a specific voice. Other voices see the exchange but stay silent. |
| **Broadcast** | Your message goes to all voices simultaneously. This is the default. |

The continuation policy (below) is only available in Broadcast mode.

---

## Continuation Policy

When **Broadcast** mode is selected, the **Continuation policy** section appears below the mode selector. This controls what happens after the first round of responses completes.

| Policy | Behavior |
|---|---|
| **None** | Voices respond once and wait. No additional rounds start automatically. |
| **Prompt me** | After each round, a nudge banner appears in the session asking whether to continue. You click Allow or Dismiss. |
| **Auto** | Voices continue responding automatically until the max rounds limit is reached. |

When **Auto** is selected, a **Max rounds** slider appears (range 1–3). This caps the total number of automatic continuation rounds.

![Composition Builder showing Broadcast mode with continuation policy set to Auto and Max rounds slider visible](/images/screenshots/compositions/builder-continuation-auto.webp)
<!-- Prerequisites: Broadcast mode selected, Auto continuation selected | Platform: any | Theme: any | Window: default -->

---

## Adding Voices

Click **Add Voice** to add a voice to the composition. For each voice, configure:

| Field | Description |
|---|---|
| **Provider** | The AI provider (Anthropic, OpenAI, Gemini, Claude CLI, custom provider, etc.) |
| **Voice type** | API or CLI — shown for providers that support both |
| **Model** | The specific model to use (e.g. `claude-sonnet-4-6`); populated from the provider |
| **Display name** | An optional display name for this voice in sessions |
| **Avatar icon** | An optional emoji or symbol shown next to this voice's messages in the feed |
| **Color** | A color swatch used to identify this voice in the message feed |
| **System prompt template** | An optional saved template to attach (see [System Prompt Templates](../system-prompt-templates/)) |
| **System prompt** | Optional inline instructions that shape this voice's behavior |
| **Tone** | Per-voice tone override — or "Use conductor default" to inherit from your profile |

![Voice configuration panel fully configured with provider, model, display name, avatar icon, color, and tone](/images/screenshots/compositions/builder-voice-config-full.webp)
<!-- Prerequisites: voice added to composition, all fields filled | Platform: any | Theme: any | Window: default -->

You can add as many voices as you like. There is no hard limit, though more voices means more tokens and longer wait times per round.

---

## Voice Type Availability

When you select a provider in the Composition Builder, the **Voice type** toggle (API / CLI) shows whether each type is available based on your current configuration:

- If an API key is not configured for that provider, the **API** button is disabled with the tooltip "No API key configured".
- If the CLI binary for that provider is not found in your PATH, the **CLI** button is disabled with the tooltip "[binary] not found" (e.g., "claude not found").
- If neither type is available, the provider button in the grid is grayed out and cannot be selected.

This prevents adding a voice that would fail when a session starts.

To configure credentials, see [Voice Providers](../providers/) (API keys and CLI tools) or [Custom Providers](../custom-providers/) (custom endpoints).

{{< video src="/videos/docs/compositions-type-toggle-with-voice.mp4" poster="/images/video-posters/docs/compositions-type-toggle.webp" track="/videos/docs/compositions-type-toggle-narration.vtt" >}}

---

## Attaching a System Prompt Template

In the voice configuration panel, the **System prompt template** dropdown lets you attach a saved template to a voice:

1. Select a template from the dropdown. The system prompt textarea is pre-filled with the template's content and a "Template attached" badge appears.
2. To go inline instead, edit the system prompt textarea directly — editing automatically detaches the template.
3. To re-attach a template after editing inline, select it again from the dropdown.

See [System Prompt Templates](../system-prompt-templates/) for how to create and manage templates.

![Voice configuration panel with Security Reviewer template attached and Template attached badge visible](/images/screenshots/compositions/builder-template-attached.webp)
<!-- Prerequisites: at least one template saved in Settings → Templates; template selected in voice config | Platform: any | Theme: any | Window: default -->

---

## Adding a Custom Provider Voice

Custom providers configured in **Settings → Custom Providers** appear in the provider grid alongside built-in providers. Select one to open the voice configuration form. The model list is populated from that provider's endpoint.

See [Custom Providers](../custom-providers/) for setup instructions.

---

## Reordering Voices

Drag voices in the voice list to change their order. The order determines how voice responses appear in the message feed — voices respond in parallel, but are displayed in composition order.

![Composition Builder voice list with drag handles on each voice row](/images/screenshots/compositions/builder-drag-handles.webp)
<!-- Prerequisites: at least 2 voices added to the composition | Platform: any | Theme: any | Window: default -->

---

## Saving a Composition

Click **Save** to save the composition. It will appear in the sidebar under your session list.

Compositions are saved locally to your SQLite database. They are not synced to any cloud service.

---

## Launching a Session from a Composition

Click a composition in the sidebar to open it, then click **Start Session**. A new session is created with all the voices from the composition pre-configured.

You can launch as many sessions from the same composition as you like. Each session is independent.

![Saved composition detail view showing name, voice list, mode, continuation policy, and Start Session button](/images/screenshots/compositions/detail-start-session.webp)
<!-- Prerequisites: a saved composition with at least 2 voices | Platform: any | Theme: any | Window: default -->

---

## Editing a Composition

Open a composition from the sidebar and click **Edit**. The composition builder reopens with the current configuration. Make your changes and click **Save**.

Editing a composition does not affect sessions that were already started from it.

---

## Archiving a Composition

To remove a composition from the sidebar without deleting it, right-click it and select **Archive**. Archived compositions are hidden but not deleted.

![Right-click context menu on a composition showing Archive and Delete options](/images/screenshots/compositions/context-menu.webp)
<!-- Prerequisites: at least one saved composition in the sidebar | Platform: any | Theme: any | Window: default -->
