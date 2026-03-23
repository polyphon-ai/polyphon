# Sprint 020: FTS5 Full-Text Search

## Overview

Sprint 019 moved Polyphon to SQLCipher whole-database encryption and explicitly unblocked
full-text search. This sprint delivers that capability: fast, local FTS across all session
message history using SQLite's built-in FTS5 engine — no third-party library, no external
service, no network call.

Two user-facing entry points are delivered together:

1. **Per-session search** — `Cmd+F` within an active session opens a floating search bar.
   Results are scoped to that session; matching messages receive a visual highlight, with
   previous/next navigation and a match counter.
2. **Global Search tab** — a new sidebar navigation destination. Searches across all sessions
   (excluding archived). Results show session name, voice chip, timestamp, and a highlighted
   text excerpt. Clicking a result opens the target session and scrolls to the matching message.

The database layer is a single migration: an FTS5 content table over `messages` with three
triggers (AFTER INSERT, AFTER DELETE, AFTER UPDATE) to keep the index in sync, plus a backfill
command to make existing transcripts searchable immediately.

## Use Cases

1. **Find a phrase in a long session** — user hits `Cmd+F` in an active session, types a keyword,
   sees matching messages highlighted with "3 of 12" navigation.
2. **Search across history** — user opens the Search tab, types a topic, sees results from all
   non-archived sessions with highlighted excerpts.
3. **Navigate to a specific past message** — user clicks a global result; the app opens that
   session and scrolls to the exact matching message.
4. **Search by voice name** — FTS index covers `voice_name`; "claude analysis" matches messages
   from a voice named "Claude" containing "analysis".
5. **Existing transcripts immediately searchable** — migration backfills the FTS index, so
   historical messages are searchable from first launch after upgrade.

## Architecture

```
Per-session (Cmd+F)              Global Search tab
SearchBar overlay                SearchView panel
  ↓ debounced (300ms, ≥2 chars)  ↓ debounced (300ms, ≥2 chars)
       searchStore
  ↓
window.polyphon.search.messages(query, sessionId?)
  ↓ IPC (validated: string ≤200, optional ID)
ipcMain.handle('search:messages')
  ↓
src/main/db/queries/search.ts → searchMessages(db, query, sessionId?)
  ↓
messages_fts MATCH ? [AND m.session_id = ?]
JOIN messages m ON m.rowid = messages_fts.rowid
JOIN sessions s ON s.id = m.session_id
ORDER BY bm25(messages_fts), m.timestamp DESC
LIMIT 50
  ↓
SearchResult[]
```

### FTS5 Virtual Table + Triggers

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content,
  voice_name,
  content='messages',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS messages_fts_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content, voice_name)
  VALUES (new.rowid, new.content, new.voice_name);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content, voice_name)
  VALUES ('delete', old.rowid, old.content, old.voice_name);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content, voice_name)
  VALUES ('delete', old.rowid, old.content, old.voice_name);
  INSERT INTO messages_fts(rowid, content, voice_name)
  VALUES (new.rowid, new.content, new.voice_name);
END;
```

Backfill in migration 012: `INSERT INTO messages_fts(messages_fts) VALUES ('rebuild')` — the
FTS5 rebuild command re-indexes from the content table without trigger double-firing.

> **Dual-maintenance note**: The trigger SQL lives in both `CREATE_TABLES_SQL` (fresh installs)
> and in migration `012` (upgrades). Future trigger corrections must update both files.

### Search Query

```sql
SELECT m.id, m.session_id, m.role, m.voice_name, m.content, m.timestamp,
       s.name AS session_name,
       s.archived,
       snippet(messages_fts, 0, '<mark>', '</mark>', '…', 18) AS snippet
FROM messages_fts
JOIN messages m ON m.rowid = messages_fts.rowid
JOIN sessions s ON s.id = m.session_id
WHERE messages_fts MATCH ?
  AND s.archived = 0
  [AND m.session_id = ?]   -- when sessionId provided
ORDER BY bm25(messages_fts), m.timestamp DESC
LIMIT 50
```

**Query sanitization**: strip FTS5 operator tokens (bare `AND`, `OR`, `NOT`, `*`, `^`, `:`),
escape embedded `"`. Do not double-quote-wrap (which would force phrase-literal mode, degrading
multi-term search). Catch any remaining FTS5 parse error and return `[]` rather than throwing.

### SearchResult Type

```typescript
// src/shared/types.ts
export interface SearchResult {
  messageId: string;
  sessionId: string;
  sessionName: string;
  role: 'conductor' | 'voice' | 'system';
  voiceName: string | null;
  snippet: string;       // FTS5 snippet with <mark> tags; rendered by SearchSnippet
  timestamp: number;
  archived: boolean;
}
```

### Snippet Rendering

`SearchSnippet.tsx` splits the FTS5 snippet string on `<mark>` / `</mark>` delimiters and
maps them to React `<mark>` elements. All text segments are rendered as plain text nodes — no
`dangerouslySetInnerHTML`. This keeps the HTML surface minimal and auditable.

### Renderer State

`searchStore.ts` owns all search state:
- `globalQuery: string`, `globalResults: SearchResult[]`, `globalLoading: boolean`
- `sessionQuery: string`, `sessionResultIds: string[]`, `sessionMatchIndex: number`
- `pendingNavigation: { sessionId: string; messageId: string } | null`

`uiStore.ts` is extended only with the new `'search'` view type. Navigation target lives in
`searchStore`, not `uiStore`.

### Per-Session Search UX

Floating overlay above the message feed (confirmed by user):
- `[🔍 Search session...  ] ✕` — auto-focused input
- Match count: "3 of 12"
- Previous / Next buttons
- Matching `MessageBubble`s receive `isSearchMatch` prop (subtle background)
- Active match receives `isActiveSearchMatch` prop (stronger ring + scroll into view)
- Auto-scroll-to-bottom in `MessageFeed` is suspended while search overlay is open;
  resumes when overlay closes

### Global Search Result Navigation

1. User clicks result in `SearchView`
2. `searchStore.setPendingNavigation({ sessionId, messageId })`
3. `openSession(sessionId)` — uses the full session-open lifecycle
4. `uiStore.setView('session')`
5. `SessionView` `useEffect([messages, pendingNavigation])` detects the pending target after
   messages load, calls `document.querySelector([data-message-id="${id}"])?.scrollIntoView({ block: 'center', behavior: 'smooth' })`, applies ephemeral pulse highlight, then `clearPendingNavigation()`

### Cmd+F Scoping

`Cmd+F` is intercepted only when:
- `activeView === 'session'`
- Focus is not inside a non-search `<input>` or `<textarea>` (conductor input, rename fields)

### IPC Channel

```typescript
// src/shared/constants.ts
SEARCH_MESSAGES: 'search:messages',
```

## Implementation Plan

### P0: Must Ship

**Schema & Migration:**
- [ ] `src/main/db/schema.ts` — add `messages_fts` virtual table + all three triggers to
  `CREATE_TABLES_SQL`; bump `SCHEMA_VERSION` from `11` to `12`
- [ ] `src/main/db/migrations/012_add_messages_fts.ts` — `up()`: create FTS table (idempotent),
  create three triggers (idempotent), run `INSERT INTO messages_fts(messages_fts) VALUES ('rebuild')`
- [ ] `src/main/db/migrations/index.ts` — import `migration012`, add `apply(12, migration012)`

**Query Layer:**
- [ ] `src/main/db/queries/search.ts` — `searchMessages(db, query, sessionId?)`: normalize FTS
  input (strip operators, escape `"`), execute query, return `SearchResult[]`; return `[]` for
  query `< 2` trimmed chars; catch FTS5 parse errors and return `[]`

**Shared Types & IPC Surface:**
- [ ] `src/shared/types.ts` — add `SearchResult` interface
- [ ] `src/shared/constants.ts` — add `SEARCH_MESSAGES: 'search:messages'`
- [ ] `src/main/ipc/validate.ts` — add `requireSearchQuery()` helper (string, trimmed, ≤200 chars)
- [ ] `src/main/ipc/index.ts` — register `ipcMain.handle(IPC.SEARCH_MESSAGES, ...)` with
  validation; pass to `searchMessages(db, query, sessionId?)`
- [ ] `src/main/preload.ts` — add `search: { messages(query, sessionId?): Promise<SearchResult[]> }`

**Renderer Store:**
- [ ] `src/renderer/store/uiStore.ts` — extend `View` union with `'search'`
- [ ] `src/renderer/store/searchStore.ts` — implement store with global query/results/loading,
  session query/result-IDs/match-index, pending navigation, and all actions

**Renderer — Global Search:**
- [ ] `src/renderer/components/Search/SearchView.tsx` — full-width panel: debounced input
  (300ms, ≥2 chars), results list, empty state (Search icon), no-results state; each result row
  shows session name, voice chip, timestamp, `<SearchSnippet>`; click → navigate. On result
  click: call `window.polyphon.session.get(sessionId)` to fetch the session object; if not
  already in `sessions[]`, add it via `setSessions`; then `openSession(sessionId)` + `setView('session')`.
  This matches the `handleOpenSession` pattern in `App.tsx` and prevents silent failure when the
  target session has not been loaded into the sessions list yet.
- [ ] `src/renderer/components/Search/SearchSnippet.tsx` — safe snippet renderer: split on
  `<mark>`/`</mark>`, map to `<mark>` React elements, text segments as plain nodes
- [ ] `src/renderer/App.tsx` — add Search nav item to both collapsed (icon-only) and expanded
  sidebar; add `{activeView === 'search' && <SearchView />}` routing block; import `Search`
  from `lucide-react`

**Renderer — Per-Session Search:**
- [ ] `src/renderer/components/Search/SessionSearchBar.tsx` — floating overlay: search input
  (debounced 300ms, ≥2 chars), match counter "N of M", prev/next buttons, close (Esc or ✕)
- [ ] `src/renderer/components/Session/MessageFeed.tsx` — add `data-message-id` attr to each
  message wrapper; accept `searchMatchIds: Set<string>` and `activeMatchId: string | null` props;
  suspend auto-scroll-to-bottom effect when `searchActive` prop is true
- [ ] `src/renderer/components/Session/MessageBubble.tsx` — accept `isSearchMatch` and
  `isActiveSearchMatch` props; apply subtle background and ring styling respectively
- [ ] `src/renderer/components/Session/SessionView.tsx` — add `Cmd+F` handler (scoped per above);
  render `<SessionSearchBar>` when open; wire `useEffect([messages, pendingNavigation])` for
  scroll-to-target; pass search match props down to `MessageFeed`

**Tests:**
- [ ] `src/main/db/queries/search.integration.test.ts` — unit tests with in-memory DB: empty
  returns `[]`, basic match, session-scoped match, FTS operator inputs return `[]` not throw,
  insert trigger syncs, delete trigger removes, update trigger moves match
- [ ] `src/main/db/migrations/migrations.integration.test.ts` — extend: schema version = 12 after
  migration; `messages_fts` table exists; seed messages before migration, verify searchable after
- [ ] `src/main/ipc/handlers.integration.test.ts` — add `search:messages` handler integration test
- [ ] `src/renderer/components/Session/SessionView.test.tsx` — update: Cmd+F opens search bar;
  Esc closes; shortcut not triggered when focus in conductor input
- [ ] `src/renderer/components/Session/MessageFeed.test.tsx` — update: `data-message-id` present;
  `isSearchMatch` prop applies styling; auto-scroll suspended when `searchActive`
- [ ] `e2e/search.spec.ts` — Playwright: open Search tab, type known term, verify result renders;
  click result, verify session opens and message is in view

### P1: Ship If Capacity Allows

- [ ] Arrow key (↑/↓) navigation within `SessionSearchBar` in addition to prev/next buttons
- [ ] Archived session toggle in `SearchView` (off by default; label: "Include archived")
- [ ] Preserve session query text when briefly switching away from a session and back

### Deferred

- Session/composition name search via LIKE — small enough sets for visual scan
- Filter chips (provider, voice, date range) — wait for user feedback
- Inline term highlighting inside rendered markdown bubbles — not needed for MVP; snippet is sufficient
- Saved searches / recents
- Result grouping by session or date

## Files Summary

| File | Action | Purpose |
|---|---|---|
| `src/main/db/schema.ts` | Modify | Add FTS table + triggers; SCHEMA_VERSION 11 → 12 |
| `src/main/db/migrations/012_add_messages_fts.ts` | Create | FTS setup + rebuild backfill |
| `src/main/db/migrations/index.ts` | Modify | Register migration 012 |
| `src/main/db/queries/search.ts` | Create | `searchMessages()` query function |
| `src/main/db/queries/search.integration.test.ts` | Create | FTS correctness + trigger tests |
| `src/shared/types.ts` | Modify | Add `SearchResult` interface |
| `src/shared/constants.ts` | Modify | Add `SEARCH_MESSAGES` IPC constant |
| `src/main/ipc/validate.ts` | Modify | Add `requireSearchQuery()` helper |
| `src/main/ipc/index.ts` | Modify | Register `search:messages` IPC handler |
| `src/main/preload.ts` | Modify | Add `search` namespace to `PolyphonAPI` |
| `src/renderer/store/uiStore.ts` | Modify | Add `'search'` view type |
| `src/renderer/store/searchStore.ts` | Create | All search state + pending navigation |
| `src/renderer/App.tsx` | Modify | Search nav item (both sidebar states) + view routing |
| `src/renderer/components/Search/SearchView.tsx` | Create | Global search panel |
| `src/renderer/components/Search/SearchSnippet.tsx` | Create | Safe `<mark>` snippet renderer |
| `src/renderer/components/Search/SessionSearchBar.tsx` | Create | Per-session floating search overlay |
| `src/renderer/components/Session/SessionView.tsx` | Modify | Cmd+F, overlay rendering, scroll-to |
| `src/renderer/components/Session/MessageFeed.tsx` | Modify | `data-message-id`, match props, auto-scroll suspension |
| `src/renderer/components/Session/MessageBubble.tsx` | Modify | `isSearchMatch`, `isActiveSearchMatch` props |
| `src/main/db/migrations/migrations.integration.test.ts` | Modify | Schema v12 + FTS backfill tests |
| `src/main/ipc/handlers.integration.test.ts` | Modify | `search:messages` handler integration test |
| `src/renderer/components/Session/SessionView.test.tsx` | Modify | Cmd+F shortcut tests |
| `src/renderer/components/Session/MessageFeed.test.tsx` | Modify | Match props + auto-scroll tests |
| `e2e/search.spec.ts` | Create | Global search E2E verification |

## Definition of Done

- [ ] `messages_fts` virtual table and three triggers present in `CREATE_TABLES_SQL` (`schema.ts`); `SCHEMA_VERSION = 12`
- [ ] Migration 012 runs cleanly on an existing DB (backfills via `rebuild`) and on a fresh DB (table already created by `CREATE_TABLES_SQL`, `rebuild` is a no-op on empty table)
- [ ] `searchMessages()` returns correct results for: basic match, multi-term query, session-scoped match, FTS operator inputs (returns `[]` not throw), query `< 2` chars (returns `[]`)
- [ ] Insert/delete/update triggers keep FTS index in sync (verified by integration test)
- [ ] `search:messages` IPC handler registered, validates inputs, returns `SearchResult[]`
- [ ] Global Search tab appears in both collapsed and expanded sidebar states
- [ ] Typing ≥2 chars in `SearchView` returns results with `<mark>`-highlighted snippets rendered safely by `SearchSnippet`
- [ ] Clicking a global result opens the correct session and scrolls to the correct message (`data-message-id` present on all message wrappers)
- [ ] Per-session search (`Cmd+F`) shows floating overlay; matching messages receive highlight; prev/next + match counter work; Esc closes
- [ ] `Cmd+F` does not intercept focus when conductor input or rename field is active
- [ ] `MessageFeed` auto-scroll-to-bottom is suspended while per-session search overlay is open
- [ ] All new integration tests pass with in-memory SQLite (never real user DB)
- [ ] `SessionView.test.tsx` and `MessageFeed.test.tsx` updated and passing
- [ ] E2E test: Search tab renders; typing a known term shows a result; clicking navigates to message
- [ ] `make lint` passes (TypeScript strict mode, no errors)
- [ ] CLAUDE.md updated (schema table, SCHEMA_VERSION, IPC channels table)

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| FTS5 query parse error on unusual user input | Medium | Low (exception only) | Normalize input; catch remaining errors; return `[]` |
| Auto-scroll fights search scroll | High | Medium | Explicit suspension: `searchActive` prop prevents auto-scroll; resume on close |
| Pending navigation race (session not loaded yet) | Medium | Medium | `useEffect([messages, pendingNavigation])` retries after messages load |
| Trigger drift / FTS index inconsistency | Low | Medium | Integration tests cover insert, delete, update trigger sync explicitly |
| `Cmd+F` intercepted in wrong context | Medium | Low (UX annoyance) | Guard: `activeView === 'session'` + `document.activeElement` not an unrelated input |
| Migration `rebuild` slow on large DBs | Low | Low (one-time startup delay) | Single SQL command; SQLite handles efficiently; not interactive |

## Security Considerations

- FTS index lives inside the SQLCipher-encrypted database file. No plaintext data escapes to disk.
- Query validated server-side: string type, trimmed, ≤200 chars.
- Snippet rendering via `SearchSnippet`: text nodes only, `<mark>` elements only. No raw HTML.
  FTS5 `snippet()` output is treated as untrusted text with known-safe delimiters — not as HTML.
- No new network surface.

## Observability & Rollback

**Verification post-ship:**
- Open Search tab; type a word from a recent session; verify results with highlighted excerpt.
- Start a new session; send a message with a unique phrase; immediately search for it; verify it
  appears (trigger sync).
- Open a session; hit Cmd+F; type a phrase; verify matching bubbles highlight and prev/next work.

**Rollback plan:**
- If FTS causes issues, the `messages_fts` virtual table and triggers can be removed via a
  follow-up migration `013_remove_messages_fts.ts` that drops the table and triggers. This does
  not affect the `messages` table.
- The `search:messages` IPC handler can be deregistered independently.
- Do not manually edit `schema_version` — always use a migration.

## Documentation

- [ ] `CLAUDE.md` schema section: add `messages_fts` to table, describe trigger sync pattern
- [ ] `CLAUDE.md` IPC channels table: add `search:messages`
- [ ] `CLAUDE.md` `SCHEMA_VERSION` reference: update 11 → 12

## Dependencies

Sprint 019 (SQLCipher whole-database encryption) — completed.

## Open Questions

All resolved:
- Query trigger: debounced 300ms, ≥2 trimmed characters
- Per-session search UI: floating overlay with results list (user-confirmed)
- Global result click: open session + scroll to message (user-confirmed)
- Archived sessions: excluded from global search by default; toggle deferred to P1
- FTS backfill: `rebuild` command (cleaner than INSERT…SELECT)
- Snippet rendering: `SearchSnippet` component splitting on `<mark>` markers (not dangerouslySetInnerHTML)
