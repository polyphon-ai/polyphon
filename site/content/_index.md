---
title: "Polyphon"
description: "Desktop app for orchestrating conversations between multiple AI voices simultaneously. One chat. Many minds."
---

## What is Polyphon?

Polyphon is a desktop application for orchestrating conversations between multiple AI voices simultaneously. You send a message — and every voice responds. Voices can read each other's replies and build on them, creating a genuine multi-agent dialogue.

The name comes from *polyphony* — many voices in harmony. You are the conductor. The AI models are the ensemble.

![Polyphon session view showing three voices that have each responded](/images/screenshots/home/live-session.webp)

---

## Key Features

### Multiple voices, one conversation

Add any combination of voices to a session — Claude, GPT-4, Gemini, or local CLI tools like `claude` or `codex`. Every voice sees the full conversation history, including what other voices have said.

### Compositions

Save a named set of voices as a **composition**, then launch new sessions from it instantly. Configure each voice's model, system prompt, and tone independently.

![Composition Builder with three voices from different providers](/images/screenshots/home/composition-builder.webp)

### API and CLI voices

Polyphon supports three kinds of voices:

- **API voices** — communicate with a remote model using your own API key (Anthropic, OpenAI, Gemini)
- **CLI voices** — spawn and communicate with a local CLI tool as a subprocess (`claude`, `codex`, `copilot`)
- **Custom voices** — user-defined OpenAI-compatible endpoints (Ollama, LM Studio, vLLM, custom proxies)

All types behave identically inside a session.

### Broadcast and conductor modes

Choose how your message reaches the voices:

- **Broadcast** — your message goes to all voices simultaneously
- **Conductor** — direct your message to a specific voice

### Continuation rounds

Set a voice to automatically continue responding after each round, enabling back-and-forth between voices without manual prompts.

![Session showing continuation round in progress with voices streaming](/images/screenshots/home/continuation-session.webp)

### Tones and system prompt templates

Shape how each voice communicates with **tone presets** — professional, collaborative, concise, exploratory, or teaching. Create custom tones and assign them per voice or set a global default in your Conductor Profile.

Save reusable **system prompt templates** and attach them to any voice in any composition. Update a template once and it applies to every new session that uses it.

### Conductor profile

Tell the voices who you are. Set your name, pronouns, background context, and preferred default tone. Every voice receives this context in its system prompt automatically.

### Local-first, no telemetry

Your conversations and API keys stay on your machine. Polyphon never phones home. There is no account, no cloud sync, no usage tracking unless you explicitly opt in.

---

## Supported Providers

| Provider | Type | Notes |
|---|---|---|
| Anthropic (Claude) | API | Requires `ANTHROPIC_API_KEY` |
| OpenAI (GPT) | API | Requires `OPENAI_API_KEY` |
| Google (Gemini) | API | Requires `GOOGLE_API_KEY` |
| Claude CLI (`claude`) | CLI | Requires `claude` in your PATH |
| OpenAI Codex (`codex`) | CLI | Requires `codex` in your PATH |
| GitHub Copilot (`copilot`) | CLI | Requires `copilot` in your PATH |
| Custom (OpenAI-compatible) | Custom Providers | Configurable base URL; Ollama, LM Studio, vLLM, and more |

---

## See it in action

{{< video src="/videos/home/full-walkthrough-with-voice.mp4" poster="/images/video-posters/home/full-walkthrough.webp" track="/videos/home/full-walkthrough-narration.vtt" >}}

---

## Get Started

Head to the [documentation](/docs/) to learn how to install Polyphon, configure your first voices, and start your first session.

Download the latest release from [GitHub](https://github.com/polyphon-ai/polyphon/releases).
