# Polyphon — CLAUDE.md

Polyphon is an Electron desktop application for orchestrating conversations
between multiple AI agents simultaneously. Agents can respond to the user and to each
other. The name comes from "polyphony" — many voices in harmony. The product should feel
like a conductor's podium: the user orchestrates, the agents are the ensemble.

**Taglines:** "One chat. Many minds." / "Every agent has a voice." / "Orchestrate the conversation."

---

## Domain Vocabulary

Use this language consistently in code, comments, and documentation:

| Concept | Term |
|---|---|
| An AI agent in a session | **voice** |
| Adding a new agent | **adding a voice** |
| A saved multi-agent configuration | **composition** |
| A conversation thread | **session** |
| The user | **conductor** (internal naming/comments) |
| One full cycle of all voices responding | **round** |

Avoid casual synonyms (agent, bot, model) in domain-facing code.

---

## Principles

- **Local-first:** default assumption is the user runs this on their own machine. No cloud dependency required.
- **Provider-agnostic:** no voice provider is first-class. Claude, OpenAI, Gemini, and local CLI tools are peers.
- **Extensible:** adding a new voice provider must be a well-defined, low-friction process (see Provider Pattern below).
- **No telemetry without explicit opt-in:** never phone home silently.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Shell | Electron 41 |
| UI framework | React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| Icons | `lucide-react` — all generic UI icons; `ProviderLogo.tsx` is the exception for provider branding |
| Typography | `geist` npm package (Geist Sans variable font, loaded locally) |
| State management | Zustand 5 |
| Database | Node built-in `node:sqlite` (`DatabaseSync`) |
| Build | Electron Forge + Vite 7 |
| Testing | Vitest 4 (unit/integration) + Playwright (e2e) |

---

## Voice Provider Types

There are three distinct kinds of voice providers:

1. **API voices** — communicate with a remote model via API key (Anthropic, OpenAI, Gemini).
2. **CLI voices** — spawn and communicate with a local CLI tool as a subprocess (`claude`, `codex`, `copilot`).
3. **Custom OpenAI-compatible voices** — user-defined endpoints (Ollama, LM Studio, vLLM, custom proxies) using the `openai-compat` provider type. Configured in Settings → Providers → Custom Providers.

All types conform to the same internal `Voice` interface so the rest of the application
treats them identically.

---

## Database

Polyphon uses SQLite via the **Node.js built-in `node:sqlite` module** (`DatabaseSync`) for
all local persistence. There is no ORM or query builder — queries are written as raw
parameterized SQL using `db.prepare()`.

SQLite lives in the **main process only**. Never import or use it from the renderer
process. All data access from the renderer goes through IPC.

### Setup

```typescript
// src/main/db/index.ts
import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync(dbPath)
db.exec('PRAGMA journal_mode = WAL')
```

### Schema (SCHEMA_VERSION = 9)

Tables: `schema_version`, `compositions`, `composition_voices`, `sessions`, `messages`,
`provider_configs`, `custom_providers`, `tones`, `system_prompt_templates`, `user_profile`

Key constraints:
- `messages.role` CHECK: `('conductor', 'voice', 'system')`
- `compositions.mode` and `sessions.mode` CHECK: `('conductor', 'broadcast')`
- `user_profile` is a single-row table enforced with `CHECK(id = 1)`
- `compositions` and `sessions` both have an `archived INTEGER NOT NULL DEFAULT 0` column
- `composition_voices` has a nullable `custom_provider_id TEXT` column (UUID into `custom_providers`) used when `provider = 'openai-compat'`
- `composition_voices` has a nullable `system_prompt_template_id TEXT` column (UUID into `system_prompt_templates`)
- `custom_providers.slug` has a UNIQUE constraint; `deleted INTEGER NOT NULL DEFAULT 0` enables soft-delete
- `tones.name` has a UNIQUE constraint; `is_builtin = 1` rows (seeded by migration 009) cannot be deleted or updated
- `tones` built-in rows use the preset key as ID (`professional`, `collaborative`, etc.); custom tones use UUIDs

### Migrations

```
src/main/db/
├── index.ts              # DatabaseSync instance + path resolution
├── schema.ts             # Raw SQL + SCHEMA_VERSION
├── migrations/
│   ├── index.ts          # Manual migration runner
│   ├── 003_system_message_role.ts
│   ├── 004_user_profile.ts
│   ├── 005_archived.ts
│   ├── 006_pronouns.ts
│   ├── 007_custom_providers.ts
│   ├── 008_voice_tone_override.ts
│   └── 009_tones_and_templates.ts
└── queries/              # One file per domain (sessions, messages, compositions, …)
```

Each migration exports an `up(db: DatabaseSync): void` function. The runner in
`migrations/index.ts` calls them in order, guarding fresh installs with `if (row !== undefined)`
where the column already exists in `CREATE_TABLES_SQL`.

**Migration rules (absolute):**

1. Migrations are append-only. Never edit a migration file after it has been committed.
2. Never run migrations from the renderer.
3. Integration tests use `:memory:` — never the user's real data directory.
4. Every schema change requires a new numbered migration file.
5. When adding a migration, update the affected query file's row interface in the same commit.


---

## Adding a New Voice Provider

New providers live under `src/main/voices/providers/` as a single TypeScript file per
provider. The pattern is:

1. Create `src/main/voices/providers/<provider-name>.ts`
2. Extend `APIVoice` (for API-key providers) or `CLIVoice` (for subprocess providers)
3. Export a `VoiceProviderRegistration` object with `provider`, `type`, and a `create` factory
4. Add one entry to the `PROVIDER_REGISTRY` array in `src/main/managers/VoiceManager.ts`
5. Add provider metadata to `PROVIDER_METADATA` in `src/shared/constants.ts`
6. Add the provider to `SETTINGS_PROVIDERS` in `src/shared/constants.ts`
7. Write at least one unit test alongside the provider file exercising the full
   `send()` → token stream → done cycle with a mocked transport

A provider must not assume it is the only provider or that it will be preferred.

---

## Folder Structure

```
polyphon/
├── src/
│   ├── main/                        # Electron main process
│   │   ├── db/
│   │   │   ├── index.ts             # DatabaseSync instance + path resolution
│   │   │   ├── schema.ts            # Raw SQL + SCHEMA_VERSION
│   │   │   ├── migrations/          # Numbered migration files + runner
│   │   │   └── queries/             # One file per domain
│   │   ├── voices/
│   │   │   ├── Voice.ts             # Voice interface + VoiceProviderRegistration
│   │   │   ├── APIVoice.ts          # Base class for API-key providers
│   │   │   ├── CLIVoice.ts          # Base class for subprocess providers
│   │   │   ├── MockVoice.ts         # Test double used in unit/e2e tests
│   │   │   └── providers/           # One file per provider + co-located tests
│   │   ├── managers/
│   │   │   ├── VoiceManager.ts      # Provider registry + per-session voice lifecycle
│   │   │   └── SessionManager.ts    # Round orchestration (broadcast, continuation)
│   │   ├── ipc/
│   │   │   ├── index.ts             # IPC handler registration
│   │   │   └── settingsHandlers.ts  # Settings-specific IPC handlers
│   │   ├── utils/                   # generateId, env resolution helpers
│   │   └── index.ts                 # Electron app entry point
│   ├── renderer/                    # React renderer process
│   │   ├── components/
│   │   │   ├── Composition/         # CompositionBuilder, VoiceSelector, VoiceOrderList
│   │   │   ├── Session/             # SessionView, MessageFeed, MessageBubble, VoicePanel, ConductorInput
│   │   │   ├── Settings/            # SettingsPage (providers, conductor profile, theme)
│   │   │   └── Shared/              # ProviderLogo, shared exports
│   │   ├── store/                   # Zustand stores: session, composition, settings, ui
│   │   ├── hooks/
│   │   ├── utils/
│   │   └── App.tsx                  # Root layout, sidebar nav, view routing
│   └── shared/                      # Code shared between main and renderer
│       ├── types.ts                 # Domain types (Voice, Session, Composition, UserProfile, …)
│       └── constants.ts             # IPC channel names, TONE_PRESETS, PROVIDER_METADATA
├── e2e/                             # Playwright e2e specs
├── Makefile                         # Dev, build, test, lint targets
└── CLAUDE.md
```

State management: Zustand stores in `src/renderer/store/` own all renderer-side state.
Main-process state is managed by `VoiceManager` and `SessionManager`.

---

## IPC Channels

All channel names are defined as constants in `src/shared/constants.ts` under `IPC`.
Streamed events (`VOICE_TOKEN`, `VOICE_DONE`, `VOICE_ERROR`, `SESSION_NO_TARGET`) are
suffixed with `:${sessionId}` at runtime to scope them to a single session.

| Domain | Channels |
|---|---|
| Sessions | `session:create`, `session:list`, `session:get`, `session:delete`, `session:archive`, `session:messages:list`, `session:continuation-prompt`, `session:no-target:${sessionId}` |
| Voices | `voice:send`, `voice:abort`, `voice:available`, `voice:token:${sessionId}`, `voice:done:${sessionId}`, `voice:error:${sessionId}` |
| Compositions | `composition:create`, `composition:list`, `composition:get`, `composition:update`, `composition:delete`, `composition:archive` |
| Settings | `settings:getProviderStatus`, `settings:testCliVoice`, `settings:saveProviderConfig`, `settings:getProviderConfig`, `settings:fetchModels`, `settings:getUserProfile`, `settings:saveUserProfile` |
| Custom Providers | `settings:customProvider:list`, `settings:customProvider:create`, `settings:customProvider:update`, `settings:customProvider:delete`, `settings:customProvider:fetchModels` |
| Tones | `settings:tone:list`, `settings:tone:create`, `settings:tone:update`, `settings:tone:delete` |
| System Prompt Templates | `settings:systemPromptTemplate:list`, `settings:systemPromptTemplate:create`, `settings:systemPromptTemplate:update`, `settings:systemPromptTemplate:delete` |


---

## API Key Resolution

API keys are resolved in the main process only and never cross the IPC boundary in plain
text. The resolver checks a provider-specific env var first (e.g. `POLYPHON_ANTHROPIC_API_KEY`),
then falls back to the provider's canonical var (e.g. `ANTHROPIC_API_KEY`). The renderer
receives only a masked representation (`ApiKeyStatus`) for display in Settings.

`shell-env` is used at startup to load environment variables from the user's login shell
so keys set in `.zshrc` / `.bash_profile` are available even when the app is launched
from the Dock.

---

## Conductor Profile

The `user_profile` table stores a single row with:

- `conductor_name` — how voices address the user
- `pronouns` — preferred pronouns injected into the ensemble system prompt
- `conductor_context` — free-form background injected into the ensemble system prompt
- `default_tone` — tone ID (built-in preset key or custom UUID); resolved via `VoiceManager.tonesById`

`VoiceManager.buildEnsembleSystemPrompt()` injects the profile into each voice's system
prompt at session init time. The Settings page has a Conductor Profile card that
auto-saves on blur/change.

System prompts can be template-backed: a `CompositionVoice` may carry a `systemPromptTemplateId`
referencing a `system_prompt_templates` row. `VoiceManager.createVoice()` resolves the template
content at voice-creation time; the inline `system_prompt` serves as a fallback snapshot.

---

## Coding Conventions

- Prefer editing existing files over creating new ones.
- Implement only what is needed — avoid over-engineering.
- Do not add comments unless the logic is non-obvious.
- Never commit secrets, credentials, or `.env` files.
- Use the domain vocabulary defined above in symbol names where it makes sense.
- New voice provider? Follow the provider pattern — don't inline provider-specific logic into core.

### Renderer icon conventions

Use `lucide-react` for all generic icons. `ProviderLogo.tsx` is the only exception (provider SVG branding).

Icon sizing:

| Context | Size | strokeWidth |
|---|---|---|
| Navigation / sidebar | 18px | 1.75 |
| Button icons (with text) | 16px | 1.75 |
| Inline / badge icons | 14px | 1.75 |
| Empty state | 40px | 1.75 |

---

## Dependency Policy

Always use the **latest stable version** of every dependency. When adding or updating packages:

- Use `npm view <package> version` to confirm the current latest before pinning.
- Use `^` ranges so patch/minor updates are not blocked.
- When a major version bump involves breaking changes, update all affected configuration
  and source files in the same commit — do not leave the codebase in a mixed-version state.
- Run `npm outdated` before starting significant new work.

---

## Testing Policy

Tests are written alongside implementation — never deferred. Every non-trivial piece of
logic gets a test when it is written.

| Layer | Tool | Location | What to test |
|---|---|---|---|
| **Unit** | Vitest | `src/**/*.test.ts(x)` | Pure functions, store actions, utility helpers, `resolveApiKey`, DB query builders, provider token streams |
| **Integration** | Vitest + `node:sqlite` in-process | `src/**/*.integration.test.ts` | IPC handlers wired to a real in-memory SQLite DB; VoiceManager provider registry |
| **E2E** | Playwright + `electron-playwright` | `e2e/` | Full app launch, session creation, composition builder, message flow |

**Rules:**

- Unit tests must not touch the filesystem, network, or spawn processes — mock at the boundary.
- Integration tests use `new DatabaseSync(':memory:')`, never the user's real data directory.
- E2E tests run against the full built app with `MockVoice` — no real API keys or CLI
  binaries required. They must pass in CI without credentials.
- `make test-e2e-live` is the opt-in target for tests against real providers — never run in CI.
  Covers built-in providers (Anthropic, OpenAI, Gemini, Copilot) and custom OpenAI-compatible
  providers. Requires API keys or CLI binaries in the developer's shell env; tests skip
  gracefully when a provider isn't configured (exit code 0).
- Every new voice provider must include at least one unit test exercising the full
  `send()` → token stream → done cycle with a mocked transport.

### Makefile targets

```
make test              # unit + integration + e2e
make test-unit         # Vitest unit tests only
make test-integration  # Vitest integration tests only
make test-e2e          # Playwright e2e with mocked voices
make test-e2e-live     # e2e against real providers (opt-in, never CI)
make test-watch        # Vitest in watch mode
```

---

## Website

The Polyphon marketing site lives under `site/`. It uses Hugo with a custom theme.

- **Hugo theme:** `site/themes/polyphon/` — built from scratch; PaperMod is no longer the active theme.
- **Design tokens:** `site/themes/polyphon/assets/css/main.css` is standalone plain CSS defining the same OKLCH color tokens and Geist Sans typography as `src/renderer/index.css`. It is **not** derived from the Tailwind app build; the site has no Node.js/Vite pipeline.
- **Fonts:** Geist Sans variable font is self-hosted at `site/static/fonts/geist-sans/Geist-Variable.woff2` (copied from `node_modules/geist/`). No external font CDN.
- **Cookie consent:** `site/layouts/partials/consent.html` (site-level, not inside the theme) + `site/data/consent.yaml`. GA fires only after explicit opt-in; no-ops on localhost.
- **Build:** `cd site && hugo --minify` — no npm install required.

---

