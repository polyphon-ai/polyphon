# Polyphon — CLAUDE.md

Polyphon is an open source GUI chat application for orchestrating conversations between multiple AI agents simultaneously. Agents can respond to the user and to each other. The name comes from "polyphony" — many voices in harmony. The product should feel like a conductor's podium: the user orchestrates, the agents are the ensemble.

**Taglines:** "One chat. Many minds." / "Every agent has a voice." / "Orchestrate the conversation."

---

## Domain Vocabulary

Use this language consistently in code, comments, and documentation:

| Concept | Term |
|---|---|
| An AI agent in a session | **voice** |
| Adding a new agent | **adding a voice** |
| A saved multi-agent configuration | **composition** |
| A conversation thread / session | **session** |
| The user | **conductor** (internal naming/comments) |

Avoid casual synonyms (agent, bot, model) in domain-facing code. Use the terms above.

---

## Principles

- **Local-first:** default assumption is the user runs this on their own machine. No cloud dependency required.
- **Provider-agnostic:** no voice provider is first-class. Claude, OpenAI, Gemini, and local CLI tools are peers.
- **Extensible:** adding a new voice provider must be a well-defined, low-friction process (see Provider Pattern below).
- **No telemetry without explicit opt-in:** never phone home silently.

---

## Voice Provider Types

There are two distinct kinds of voice providers:

1. **API voices** — communicate with a remote model via API key (e.g. Claude API, OpenAI, Gemini).
2. **CLI voices** — spawn and communicate with a local CLI tool as a subprocess (e.g. `claude`, `codex`, `gemini`).

Both types must conform to the same internal voice interface so the rest of the application treats them identically.

---

## Adding a New Voice Provider

New providers live under `src/providers/` (or equivalent) and must implement the voice provider interface. The pattern is:

1. Create a new file/module: `src/providers/<provider-name>/`
2. Implement the provider interface (TBD as architecture matures — document here when defined)
3. Register the provider in the provider registry
4. Add any required configuration schema (API key, binary path, etc.)
5. Write at least one integration test exercising the full message round-trip

A provider must not assume it is the only provider or that it will be preferred. No hardcoded defaults that favor a specific provider.

---

## Folder Structure Conventions

Structure is still being established. Update this section as it solidifies.

```
polyphon/
├── src/
│   ├── providers/       # Voice provider implementations (one dir per provider)
│   ├── session/         # Session (conversation thread) management
│   ├── composition/     # Composition (saved multi-agent config) management
│   ├── ui/              # GUI layer
│   └── core/            # Shared domain types, interfaces, utilities
├── compositions/        # User-saved composition files (local storage)
├── sessions/            # User session history (local storage)
└── CLAUDE.md
```

---

## Coding Conventions

- Prefer editing existing files over creating new ones.
- Implement only what is needed — avoid over-engineering.
- Do not add comments unless the logic is non-obvious.
- Never commit secrets, credentials, or `.env` files.
- Use the domain vocabulary defined above in symbol names where it makes sense (e.g. `Voice`, `Composition`, `Session`, `Conductor`).
- New voice provider? Follow the provider pattern above — don't inline provider-specific logic into core.

---

## CLI

The CLI alias is `poly`. Commands follow the pattern `poly <verb>` (e.g. `poly chat`, `poly add`, `poly run`). Keep CLI subcommands consistent with the domain vocabulary.

---

## License

Apache 2.0
