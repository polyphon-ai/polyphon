---
title: "Compositions"
weight: 30
description: "Create and manage compositions — named, reusable sets of voices for launching consistent multi-agent sessions in Polyphon."
---

A **composition** is a saved, named configuration of voices. Create one to quickly launch consistent multi-voice sessions without reconfiguring voices each time.

---

## Creating a Composition

Click the **New Composition** button in the sidebar (below the session list).

![Sidebar showing the New Composition button](/images/screenshots/compositions/sidebar-new-button.webp)

The composition builder opens. Give your composition a name, then add voices.

![Composition builder empty state with name field and Add Voice button](/images/screenshots/compositions/builder-empty.webp)

---

## Adding Voices

Click **Add Voice** to add a voice to the composition. For each voice, configure:

| Field | Description |
|---|---|
| **Provider** | The AI provider (Anthropic, OpenAI, Gemini, Claude CLI, custom provider, etc.) |
| **Voice type** | API or CLI — shown for providers that support both |
| **Model** | The specific model to use (e.g. `claude-opus-4-5`); populated from the provider |
| **Display name** | An optional display name for this voice in sessions |
| **Color** | A color swatch used to identify this voice in the message feed |
| **System prompt template** | An optional saved template to attach (see [System Prompt Templates](../system-prompt-templates/)) |
| **System prompt** | Optional inline instructions that shape this voice's behavior |
| **Tone** | Per-voice tone override — or "Use conductor default" to inherit from your profile |

![Voice configuration panel fully configured with provider, model, display name, and tone](/images/screenshots/compositions/builder-voice-config-full.webp)

You can add as many voices as you like. There is no hard limit, though more voices means more tokens and longer wait times per round.

---

## Voice Type Availability

When you select a provider in the Composition Builder, the **Voice type** toggle (API / CLI) shows whether each type is available based on your current configuration:

- If an API key is not configured for that provider, the **API** button is disabled with the tooltip "No API key configured".
- If the CLI binary for that provider is not found in your PATH, the **CLI** button is disabled with the tooltip "[binary] not found" (e.g., "claude not found").
- If neither type is available, the provider button in the grid is grayed out and cannot be selected.

This prevents adding a voice that would fail when a session starts.

To configure credentials, see [Voice Providers](../providers/) (API keys and CLI tools) or [Custom Providers](../custom-providers/) (custom endpoints).

{{< video src="/videos/docs/compositions-type-toggle.mp4" poster="/images/video-posters/docs/compositions-type-toggle.webp" >}}

---

## Attaching a System Prompt Template

In the voice configuration panel, the **System prompt template** dropdown lets you attach a saved template to a voice:

1. Select a template from the dropdown. The system prompt textarea is pre-filled with the template's content and a "Template attached" badge appears.
2. To go inline instead, edit the system prompt textarea directly — editing automatically detaches the template.
3. To re-attach a template after editing inline, select it again from the dropdown.

See [System Prompt Templates](../system-prompt-templates/) for how to create and manage templates.

![Voice configuration panel with Security Reviewer template attached](/images/screenshots/compositions/builder-template-attached.webp)

---

## Adding a Custom Provider Voice

Custom providers configured in **Settings → Custom Providers** appear in the provider grid alongside built-in providers. Select one to open the voice configuration form. The model list is populated from that provider's endpoint.

See [Custom Providers](../custom-providers/) for setup instructions.

---

---

## Reordering Voices

Drag voices in the voice list to change their order. The order determines how voice responses appear in the message feed — voices respond in parallel, but are displayed in composition order.

![Composition builder voice list with drag handles on each voice row](/images/screenshots/compositions/builder-drag-handles.webp)

---

## Saving a Composition

Click **Save** to save the composition. It will appear in the sidebar under your session list.

Compositions are saved locally to your SQLite database. They are not synced to any cloud service.

---

## Launching a Session from a Composition

Click a composition in the sidebar to open it, then click **Start Session**. A new session is created with all the voices from the composition pre-configured.

You can launch as many sessions from the same composition as you like. Each session is independent.

![Saved composition detail view showing the Start Session button](/images/screenshots/compositions/detail-start-session.webp)

---

## Editing a Composition

Open a composition from the sidebar and click **Edit**. The composition builder reopens with the current configuration. Make your changes and click **Save**.

Editing a composition does not affect sessions that were already started from it.

---

## Archiving a Composition

To remove a composition from the sidebar without deleting it, right-click it and select **Archive**. Archived compositions are hidden but not deleted.

![Composition card showing archive and delete action buttons](/images/screenshots/compositions/context-menu.webp)
