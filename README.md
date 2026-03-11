# Polyphon

> One chat. Many minds.

Polyphon is an open source GUI chat application for orchestrating conversations between multiple AI agents simultaneously. Agents respond to you *and* to each other — not just in sequence, but in genuine dialogue.

The name comes from *polyphony* — many voices in harmony. The product feels like a conductor's podium: you orchestrate, the agents are the ensemble.

---

## Features

- **Multi-agent sessions** — run Claude, GPT, Gemini, and others in a single conversation thread
- **Agent-to-agent dialogue** — agents can read and respond to each other, not just to you
- **API voices** — connect any model via API key
- **CLI voices** — integrate local tools like `claude`, `codex`, or `gemini` as first-class participants
- **Compositions** — save and reload multi-agent configurations
- **Local-first** — runs entirely on your machine; no account required

---

## Vocabulary

Polyphon uses musical metaphors consistently throughout the codebase and UI:

| Concept | Term |
| --- | --- |
| An AI agent in a session | **voice** |
| A saved multi-agent configuration | **composition** |
| A conversation thread | **session** |

---

## Getting Started

> The project is in early development. Installation instructions will be added as the build system is established.

```sh
# CLI alias
poly chat        # start a new session
poly add         # add a voice to the current session
poly run         # run a saved composition
```

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

---

## Security

Please do not open public issues for security vulnerabilities. See [SECURITY.md](SECURITY.md) for the responsible disclosure policy.

---

## License

[Apache 2.0](LICENSE)
