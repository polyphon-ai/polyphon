---
title: "Settings"
weight: 30
description: "Configure voice providers, manage tones and system prompt templates, set up your Conductor Profile, and view app info in Polyphon."
---

The Settings page lets you configure voice providers, manage tones and system prompt templates, set up your Conductor Profile, and view app information. Open it by clicking the **gear icon** in the bottom-left corner of the main window.

Settings is organized into tabs: **Providers**, **Custom Providers**, **Tones**, **System Prompt Templates**, **Conductor Profile**, **Encryption**, and **About**.

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

## Encryption

The **Encryption** tab lets you manage how Polyphon protects sensitive data stored in its local database — message content, conductor profile, system prompt templates, and voice configurations.

### How it works

Polyphon uses AES-256-GCM field-level encryption. When you first launch the app, a 256-bit database key is generated and stored in `polyphon.key.json` alongside the database. By default the key is wrapped using your operating system's secure storage:

- **macOS** — macOS Keychain
- **Windows** — Windows Data Protection API (DPAPI)
- **Linux** — libsecret (falls back to basic text storage if libsecret is not installed)

This all happens automatically with no user action required. Existing plaintext rows continue to load correctly after upgrading.

### Setting a password

For stronger protection — especially on Linux or shared machines — you can set a password. Polyphon will use `scrypt` to derive a wrapping key from your password, replacing the OS-level wrapping. On every subsequent startup a small unlock window will appear before the main window.

1. Open **Settings → Encryption**.
2. Click **Set password** and enter a password twice to confirm.
3. Click **Save**.

Your database key never changes when you set, change, or remove a password — only the wrapping changes, so all existing encrypted data remains readable.

### Changing or removing a password

- **Change password** — enter your current password and the new one, then click **Save**.
- **Remove password** — enter your current password and click **Remove password**. The key reverts to OS-level wrapping and the unlock window no longer appears on startup.

### Linux notice

If you are on Linux and libsecret is not available, the OS-level wrapping falls back to plain text storage, which provides weaker protection. Polyphon will show a one-time notice recommending that you set a password. You can dismiss this notice permanently from the Encryption tab.

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

Polyphon stores all data locally. The database and encryption key files are located at:

| Platform | Path |
|---|---|
| macOS | `~/Library/Application Support/polyphon/` |
| Windows | `%APPDATA%\polyphon\` |
| Linux | `~/.config/polyphon/` |

Inside that directory:

| File | Contents |
|---|---|
| `polyphon.db` | Your sessions, messages, compositions, API keys, and settings |
| `polyphon.key.json` | The encryption key (wrapped by OS secure storage or your password) |

Back up both files together to preserve your data and maintain the ability to decrypt it.

---

## Telemetry

Polyphon does not collect or transmit usage data by default. There is no analytics, no crash reporting, and no network activity beyond the API calls you explicitly trigger by sending messages.
