---
title: "Polyphon Has Come a Long Way. Here's Everything It Can Do."
description: "Polyphon started as a simple idea: put multiple AI models in the same conversation and see what happens. Here's a complete tour of what it has grown into — sessions, compositions, tools, encryption, MCP, and a new terminal CLI."
date: "2026-03-24T18:00:00-05:00"
draft: false
tags: ["multi-agent", "ai", "features", "orchestration"]
categories: ["Product", "AI"]
image: "polyphon-feature-tour.webp"
---
{{< figure-float src="polyphon-feature-tour.webp" alt="A conductor silhouetted against a glowing ring of microphones, holding a baton" >}}

Put multiple AI models in the same conversation. Let them read each other's replies. See what happens.

That was the original idea. No grand roadmap — just a hunch that the interesting part of working with AI wasn't any one model in isolation, but what happened when different models encountered the same problem from different angles.

Polyphon started as that experiment. It has since grown into a full workspace for running, shaping, and reusing those conversations. Here's the whole thing.

## The Conversation

The center of Polyphon is the **session**.

A session is one shared conversation where multiple AI **voices** respond to a common thread. Each voice reads the full history — including what the other voices have already said — and replies. You write once. The ensemble responds in rounds.

![Three voices responding simultaneously in a Polyphon session](/images/screenshots/sessions/live-three-voices.webp)

There are two ways to run a session:

**Broadcast** sends your message to every voice simultaneously — best for getting a full ensemble response to a new prompt.

**Conductor mode** lets you target a single voice using @-mentions while the rest of the conversation stays in context. You can say "expand on that" or "argue the opposite case" to one specific voice without restarting the ensemble.

![At-mention dropdown for targeting a specific voice in conductor mode](/images/screenshots/sessions/at-mention-dropdown.webp)

That second mode matters more than it sounds. Once a conversation is underway, being able to direct a single voice — while the others stay in the room — is what makes Polyphon feel like a genuine discussion rather than a set of parallel monologues.

## Continuation

Not every session should stop after one round.

Polyphon's **continuation** system lets you decide how much initiative the ensemble has. Continuation can be off, set to prompt before each new round, or enabled automatically for a bounded number of rounds.

![Continuation auto mode enabled in the builder](/images/screenshots/compositions/builder-continuation-auto.webp)

This changes the rhythm of the work significantly. Set a critic voice and a builder voice running on a spec for a few rounds of auto-continuation, and come back to a debate already underway. The voices challenge and build on each other — you step back in whenever you want to redirect or stop. You stay the conductor, but you do not have to hold the baton for every beat.

## The Voices

Polyphon is built so no single provider defines the product. There are three kinds of voices:

- **API voices** — Anthropic Claude, OpenAI GPT, and Google Gemini, using your own API keys
- **CLI voices** — local tools like `claude`, `codex`, and `copilot`, running as subprocesses
- **Custom OpenAI-compatible voices** — Ollama, LM Studio, vLLM, or any endpoint that speaks the OpenAI chat format

![Composition builder showing voices from three different providers](/images/screenshots/compositions/builder-three-providers.webp)

These are all first-class peers inside the product. A session that mixes a cloud model, a local Ollama instance, and the `codex` CLI is not a workaround — it is the intended use case. The question Polyphon is designed around is "What voices do I want in this room?" not "Which single model am I supposed to use?"

## Compositions: Reusable Ensembles

A **composition** is a saved voice configuration you can start sessions from as often as you like.

![Composition list in the sidebar](/images/screenshots/compositions/list-sidebar.webp)

The composition builder gives you full control over each voice: provider and model, system prompt, reusable template, tone, enabled tools, and position in the voice order.

![Full voice configuration in the composition builder](/images/screenshots/compositions/builder-voice-config-full.webp)

Composition-level settings include the session mode (broadcast or conductor) and the continuation policy. A composition is not just a saved list of models. It is a reusable way of thinking — a research panel, a code review ensemble, a writing setup — ready to go without rebuilding from scratch.

## Voices That Can Act

For API voices and OpenAI-compatible voices, Polyphon can expose a tool layer that goes beyond text generation. Voices can read files, run commands, modify a workspace, and pull in external context.

| Tool | Writable | What It Does |
|---|---|---|
| `read_file` | — | Read a file (up to 50 KB) |
| `write_file` | ✓ | Write or overwrite a file |
| `list_directory` | — | Recursively list directory contents |
| `run_command` | ✓ | Execute a command and return output |
| `search_files` | — | Find files by name pattern |
| `grep_files` | — | Search file contents by pattern |
| `move_file` | ✓ | Move or rename a file |
| `copy_file` | ✓ | Copy a file |
| `delete_file` | ✓ | Delete a file |
| `fetch_url` | — | Fetch a URL as text |

Tools are enabled per voice, not globally. A planner voice might only need read access. A coding voice might need file writes and shell commands. A reviewer voice may be more trustworthy with limited tools.

![Tool selection for a voice in the composition builder](/images/screenshots/compositions/builder-voice-tools.webp)

Set a **working directory** on a session to give tool-enabled voices a shared project context. Enable **sandboxing** to restrict filesystem tools to that directory, so voices cannot reach outside the workspace you selected.

## How You Shape Each Voice

Three settings let you tune how voices communicate.

**Tones** set the register of a voice's responses. Built-in presets cover Professional, Casual, Collaborative, Socratic, and more — you can also define custom tones and apply them globally or override per-voice.

![Tone selection dropdown in the composition builder](/images/screenshots/compositions/builder-tone-dropdown.webp)

**System prompt templates** let you write a reusable role once and attach it across multiple compositions. If you keep reaching for the same "senior code reviewer" or "devil's advocate" prompt, templates turn those into stable building blocks instead of repeated copy-paste.

![System prompt template library in Settings](/images/screenshots/settings/templates-tab.webp)

**Your conductor profile** is injected into every session automatically — your name, pronouns, background context, and preferred tone. Voices know who they are working with from the start of each session.

![Conductor profile settings card](/images/screenshots/settings/conductor-profile.webp)

## Search, Export, and Encryption

Polyphon maintains a full-text search index over every message in every session. Search globally to find something from weeks ago, or use in-session search to locate a specific exchange within a long thread.

![Global search results](/images/screenshots/search/global-results.webp)

Any session can be exported as Markdown, JSON, or plain text from the session header menu — useful for notes, documentation, or downstream scripts.

All of it lives on your machine in a local SQLCipher-encrypted SQLite database — AES-256 whole-file encryption, not just a password hash. Polyphon does not require an account and does not route your work through a cloud backend. There is no telemetry.

If you want an extra layer, Settings → Encryption lets you set a database password. Polyphon prompts for it on launch before unlocking the database. For work that involves drafts, code, research, or client material, having that control as the default matters.

## Using Polyphon From Other Tools

The desktop UI is one way into Polyphon. Two more have been added recently.

**MCP Server** — Polyphon can run as an MCP tool server. Agent tools like Claude Code or Codex can call your compositions directly: list them, create a session, broadcast to all voices, ask a specific voice, retrieve session history. Enable it in Settings → MCP Server, or run headlessly with `polyphon --mcp-server --headless` for pipelines that do not need a window open.

**TCP API Server and `poly` CLI** — The built-in API server combined with the `poly` CLI (`@polyphon-ai/poly`) gives you terminal-level control:

```bash
# List your saved compositions
poly compositions list

# Start a session and broadcast a prompt, streaming responses live
poly run --composition <id> --prompt "Review this spec" --stream

# Export a session as markdown
poly sessions export <id> --format markdown > transcript.md
```

`poly` supports named remotes for connecting to a Polyphon instance on another machine, which makes it practical in CI pipelines and server-side agent workflows.

## The Same Idea, With Real Structure

That original premise — one conversation, many voices — is still the whole point.

What has been built around it is the structure that makes it useful as more than a demo: the compositions you refine over time, the tools that let voices act on your workspace, the encryption that keeps your data yours, and the interfaces that let Polyphon participate in larger workflows beyond the desktop app.

**[Download Polyphon](https://polyphon.ai/#download)** for macOS. Free, no account required.

---

*What would your first Polyphon composition be for?*
