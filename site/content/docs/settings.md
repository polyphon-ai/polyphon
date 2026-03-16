---
title: "Settings"
weight: 30
description: "Configure voice providers, manage tones and system prompt templates, set up your Conductor Profile, and view app info in Polyphon."
---

The Settings page lets you configure voice providers, manage tones and system prompt templates, set up your Conductor Profile, and view app information. Open it by clicking the **gear icon** in the bottom-left corner of the main window.

Settings is organized into tabs: **Providers**, **Custom Providers**, **Tones**, **System Prompt Templates**, **Conductor Profile**, and **About**.

![Full Settings page showing the tab navigation bar with all six tabs](/images/screenshots/settings/settings-overview.webp)
<!-- Prerequisites: Settings open | Platform: any | Theme: any | Window: default -->

---

## Provider Settings

Each supported voice provider has its own settings card. The card shows the provider's current status and lets you enter or update credentials.

![Settings Providers tab showing all provider cards in their default states](/images/screenshots/settings/providers-tab-all-cards.webp)
<!-- Prerequisites: Settings → Providers tab open, no keys configured | Platform: any | Theme: any | Window: default -->

### API key providers

For API-based providers (Anthropic, OpenAI, Google):

1. Expand the provider card.
2. Paste your API key in the key field.
3. Click **Save** to store the key locally.
4. Click **Test** to verify the key works.

The key is stored in your local database and is never transmitted anywhere except to the provider's API when you send a message.

### CLI providers

For CLI-based providers (Claude CLI, Codex, Copilot):

1. Expand the provider card.
2. Polyphon automatically detects whether the CLI tool is available in your `PATH`.
3. Click **Test** to confirm Polyphon can invoke the tool.

If the CLI tool is not found, install it following the provider's official instructions and ensure it is on your `PATH`.

---

## Model Selection

For API providers, you can select which model to use as the default when adding a voice from that provider. You can also override the model on a per-voice basis within a composition.

Click **Fetch Models** to retrieve the current list of available models from the provider's API.

![Anthropic provider card expanded showing voice type selector, API key field, and Fetch Models button](/images/screenshots/settings/providers-tab-anthropic-expanded.webp)
<!-- Prerequisites: Settings → Providers tab, Anthropic card expanded | Platform: any | Theme: any | Window: default -->

---

## Custom Providers

The **Custom Providers** tab lets you add and manage OpenAI-compatible voice endpoints — such as a local Ollama instance, LM Studio, or a private inference proxy. Once added, a custom provider appears in the Composition Builder alongside built-in providers.

See [Custom Providers](../custom-providers/) for the full setup flow.

---

## Tones

The **Tones** tab lets you create and manage tone presets — reusable voice-behavior configurations that shape how a voice communicates. Polyphon ships five built-in tones (Professional, Collaborative, Concise, Exploratory, Teaching), which can be edited and deleted.

See [Tones](../tones/) for details on creating custom tones and assigning them to voices.

---

## System Prompt Templates

The **System Prompt Templates** tab lets you create and manage system prompt templates — saved, reusable system prompts that can be attached to any voice in a composition.

See [System Prompt Templates](../system-prompt-templates/) for details on creating templates and attaching them to voices.

---

## Conductor Profile

The **Conductor Profile** tab stores information about you that is shared with all voices — your avatar, name, pronouns, background context, and default tone. See [Conductor Profile](../conductor-profile/) for the full details.

---

## About

The **About** tab shows information about your current installation:

- **Version** — the installed version number (e.g. `v0.2.0`)
- **Channel badge** — shown for pre-release builds: Alpha, Beta, or Dev
- **Build expiry** — for alpha and beta builds, an animated countdown shows how many days remain before the build expires. Expired alpha/beta builds stop working; download the latest release to continue.
- **Glossary** — a quick-reference list of Polyphon's domain vocabulary (Voice, Session, Composition, Round, etc.)
- **Documentation** — a link to [polyphon.ai/docs](https://polyphon.ai/docs)
- **Community links** — file a bug, request a feature, join the discussion, report a vulnerability (all link to GitHub)
- **Social** — link to [@PolyphonAI on X](https://x.com/PolyphonAI)

![Settings About tab showing version badge, channel badge, waveform animation, and build expiry countdown](/images/screenshots/settings/about-page.webp)
<!-- Prerequisites: Settings → About tab open; use a beta or alpha build to show the expiry countdown and waveform | Platform: any | Theme: any | Window: default -->

---

## Data Location

Polyphon stores all data locally. The database file is located at:

| Platform | Path |
|---|---|
| macOS | `~/Library/Application Support/polyphon/polyphon.db` |
| Windows | `%APPDATA%\polyphon\polyphon.db` |
| Linux | `~/.config/polyphon/polyphon.db` |

Your API keys, session history, and compositions are all in this file. Back it up if you want to preserve your data.

---

## Telemetry

Polyphon does not collect or transmit usage data by default. There is no analytics, no crash reporting, and no network activity beyond the API calls you explicitly trigger by sending messages.
