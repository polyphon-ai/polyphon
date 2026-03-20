# Sprint 016: Markdown Rendering for Voice Responses

## Overview

Voice and conductor responses in Polyphon are currently rendered as plain text with
`whitespace-pre-wrap`. AI models routinely produce markdown — headings, code blocks, lists,
bold/italic emphasis — and displaying raw syntax characters degrades readability. This sprint
wires `react-markdown` + `rehype-sanitize` + `react-syntax-highlighter` into `MessageBubble.tsx`
so that markdown renders as formatted output with full XSS protection and Electron-safe link
handling.

The implementation is entirely renderer-side: no IPC changes, no DB changes, no CSP changes.
`MessageBubble.tsx` is the single choke point for all rendered message content, and
`MessageFeed.tsx` already routes both persisted and live-streaming content through it.

Syntax highlighting for fenced code blocks is in scope for this sprint.

## Rendering Policy

**Supported markdown features:**
headings, paragraphs, bold/italic emphasis, lists (ordered and unordered), blockquotes,
inline code, fenced code blocks, thematic breaks, and links.

**Code blocks:** rendered with `react-syntax-highlighter` (Prism), narrow import path
(language-specific imports, no full theme/language bundle).

**Links:** rendered via a custom `<a>` renderer. The `href` attribute is preserved in markup for
copy-link behavior, but default navigation is always prevented. Only `https:` and `http:` scheme
URLs invoke `window.polyphon.shell.openExternal()` via the preload bridge. Any other scheme (e.g.
`file:`, `javascript:`, `ms-msdt:`) renders the link text with a disabled visual state and
no action. Raw OS-level anchor navigation is never permitted from transcript content.

**Not supported in this sprint:** raw HTML rendering, arbitrary embedded elements, Mermaid,
math/LaTeX, or any plugin requiring `rehype-raw` or CSP relaxation.

## Use Cases

1. **Code responses** — a fenced code block renders with a distinct background, monospace font,
   and syntax highlighting rather than backtick soup.
2. **Structured answers** — numbered lists and bullet breakdowns render as `<ol>`/`<ul>` with
   proper indentation.
3. **Inline emphasis** — bold and italic text render as intended.
4. **Conductor messages** — the user's own markdown-formatted prompts render symmetrically with
   voice responses.
5. **Long streaming response** — as tokens arrive, markdown renders incrementally; very short
   early chunks (< `STREAMING_PLAIN_THRESHOLD`) render as plain text to avoid a half-open-fence
   flash on the first few tokens.
6. **Decryption-failed sentinel** — `'\u0000[decryption-failed]\u0000'` still short-circuits
   to `[Message unavailable]` before any markdown pipeline runs.
7. **Hostile content** — `<script>` tags, event handlers, and `javascript:` hrefs are stripped
   by `rehype-sanitize`; no new executable surface is introduced.

## Architecture

```
Historical message content / streamingContent
    ↓
MessageBubble.tsx
    ├─ sentinel check → "[Message unavailable]" (unchanged)
    ├─ isThinking → animated dots (unchanged)
    ├─ system message → plain divider row (unchanged)
    └─ conductor / voice content
         ↓
    MarkdownContent.tsx  (new)
         ├─ STREAMING_PLAIN_THRESHOLD guard (30 chars, named constant)
         ├─ react-markdown
         │    ├─ rehype-sanitize  (defense-in-depth; raw HTML never enabled)
         │    ├─ custom <a> renderer → window.polyphon.shell.openExternal()
         │    ├─ custom <code> renderer → inline code styling
         │    └─ custom code block renderer → react-syntax-highlighter (Prism)
         └─ .prose-voice CSS class  (scoped transcript typography)
```

**Security invariants:**
- No `dangerouslySetInnerHTML`
- No `rehype-raw` or equivalent raw-HTML plugin
- No production CSP changes
- Decryption-failed sentinel pre-empts all rendering
- Links route through the existing `shell.openExternal` preload bridge
- `rehype-sanitize` runs as defense-in-depth

## Implementation Plan

### P0: Must Ship

**New files:**
- `src/renderer/components/Session/MarkdownContent.tsx`
- `src/renderer/components/Session/MarkdownContent.test.tsx`
- `src/renderer/components/Session/MessageBubble.test.tsx`

**Modified files:**
- `package.json` — add `react-markdown`, `rehype-sanitize`, `react-syntax-highlighter`
- `src/renderer/components/Session/MessageBubble.tsx` — swap content nodes for `<MarkdownContent>`
- `src/renderer/index.css` — add `.prose-voice` scoped typography styles

**Tasks:**

#### Dependencies
- [ ] `npm view react-markdown version` + `npm view rehype-sanitize version` + `npm view react-syntax-highlighter version` to confirm latest before installing
- [ ] `npm install react-markdown rehype-sanitize react-syntax-highlighter`
- [ ] Verify `npm run lint` passes after install

#### `MarkdownContent.tsx`
- [ ] Export `STREAMING_PLAIN_THRESHOLD = 30` as a named constant
- [ ] Accept props: `content: string`, `isStreaming?: boolean`
- [ ] When `isStreaming && content.length < STREAMING_PLAIN_THRESHOLD`, render as `<span className="whitespace-pre-wrap break-words">{content}</span>`
- [ ] Otherwise render via `ReactMarkdown` with a `rehype-sanitize` plugin configured with a custom schema that strips `href` from `<a>` elements (custom renderer manages hrefs; sanitizer must not pass them through as a fallback path)
- [ ] Custom `<a>` renderer: keep `href` attribute for copy-link behavior; always call `e.preventDefault()`; extract and validate scheme — only `https:` and `http:` call `window.polyphon.shell.openExternal(href)`; all other schemes render visually as a disabled/inert link (e.g. `cursor-not-allowed opacity-50`); `rel="noreferrer noopener"`; keyboard accessible (`onKeyDown` Enter/Space mirrors click handler)
- [ ] Custom inline code renderer: distinct monospace styling
- [ ] Custom fenced code block renderer: `react-syntax-highlighter` with Prism, narrowly-imported language support (no full bundle), fallback to unstyled `<pre><code>` when no language detected
- [ ] Choose a Prism theme that maps to the app's existing dark/light token palette (e.g., `prism-tomorrow` for dark, `prism` for light, toggled via Tailwind's `dark:` class or CSS variable)
- [ ] Wrap output in `<div className="prose-voice">`

#### `MessageBubble.tsx`
- [ ] Import and use `<MarkdownContent content={displayContent} isStreaming={isStreaming} />` in place of `{displayContent}` in the voice bubble (line ~176)
- [ ] Same replacement in the conductor bubble (line ~97)
- [ ] Remove `whitespace-pre-wrap` from both bubble container `<div>` classNames (markdown owns its own spacing; `break-words` can stay)
- [ ] Preserve all existing behavior: `isThinking` dots, system message divider, streaming badge, thinking badge, avatar, header, timestamp, alignment
- [ ] Do not refactor unrelated bubble layout code

#### `MessageFeed.tsx` — Scroll compensation
- [ ] Audit current `useEffect` scroll trigger: it fires on `messages.length`, `streamingVoices.size`, and `pendingVoices.size` — but markdown rendering expands bubble height on every token, which is not tracked
- [ ] Add `streamingContent` (or a derived content-size value) to the scroll `useEffect` dependency array so the feed stays pinned to the bottom as markdown expands during streaming

#### Scoped CSS (`.prose-voice`)
- [ ] Add `.prose-voice` block to `src/renderer/index.css`
- [ ] Style: paragraphs, headings (h1–h4), lists (`ul`, `ol`, `li`), blockquotes, inline `<code>`, fenced code block wrapper, links
- [ ] Keep spacing compact for chat bubbles (not full-page prose rhythm)
- [ ] Long code lines: horizontal scroll on the code block container (`overflow-x: auto`)
- [ ] Dark mode variants for all prose-voice styles
- [ ] Do not apply `.prose-voice` globally — only inside `MarkdownContent`

### P1: Ship If Capacity Allows

_(Nothing — syntax highlighting is already in P0 per user decision.)_

### Deferred

- Copy-code button on code blocks
- Mermaid / math / LaTeX rendering
- `@tailwindcss/typography` plugin adoption
- Markdown toolbar or composer preview
- Expanding clickable-link scope beyond `openExternal` (e.g., in-app navigation from links)

## Files Summary

| File | Action | Purpose |
|---|---|---|
| `package.json` | Modify | Add react-markdown, rehype-sanitize, react-syntax-highlighter |
| `src/renderer/components/Session/MarkdownContent.tsx` | Create | Markdown renderer with streaming guard, link bridge, syntax highlighting |
| `src/renderer/components/Session/MarkdownContent.test.tsx` | Create | Unit tests for markdown policy and sanitization behavior |
| `src/renderer/components/Session/MessageBubble.test.tsx` | Create | Integration tests for conductor/voice rendering, sentinel, thinking, streaming |
| `src/renderer/components/Session/MessageBubble.tsx` | Modify | Swap text nodes for MarkdownContent; remove whitespace-pre-wrap |
| `src/renderer/components/Session/MessageFeed.tsx` | Modify | Add streamingContent to scroll useEffect deps |
| `src/renderer/index.css` | Modify | `.prose-voice` scoped transcript typography |

## Definition of Done

**User-facing:**
- [ ] Voice messages render markdown (headings, lists, emphasis, code blocks)
- [ ] Conductor messages render markdown symmetrically
- [ ] Fenced code blocks render with syntax highlighting (Prism)
- [ ] Streaming content is stable during token-by-token updates
- [ ] External links in markdown open in the system browser (not inline Electron webview)

**Security:**
- [ ] No `dangerouslySetInnerHTML` in the implementation
- [ ] No `rehype-raw` or raw-HTML plugin
- [ ] `rehype-sanitize` active in the markdown pipeline
- [ ] Production CSP unchanged (confirmed via devtools — no new violations)
- [ ] `<script>` tag in message content is not rendered or executed
- [ ] `javascript:` href in a markdown link does not execute or navigate
- [ ] `file://` and other non-http(s) scheme links render as disabled/inert (not opened)
- [ ] `https:` / `http:` links open in the system browser via `shell.openExternal`
- [ ] Decryption-failed sentinel still yields `[Message unavailable]`
- [ ] `rehype-sanitize` custom schema strips `href` from `<a>` elements in AST
- [ ] `npm audit` passes with no new high/critical advisories

**Accessibility:**
- [ ] Markdown links are keyboard-accessible (Enter/Space triggers `shell.openExternal`)
- [ ] Disabled/inert links (blocked schemes) are visually distinct and not in the tab order

**Code quality:**
- [ ] `STREAMING_PLAIN_THRESHOLD` is a named exported constant
- [ ] `react-syntax-highlighter` imported with narrow language-specific path (not full bundle)
- [ ] `.prose-voice` styles are scoped — no global prose reset
- [ ] `whitespace-pre-wrap` removed from markdown-rendered bubble containers
- [ ] Production CSP unchanged (confirmed via devtools — no new violations)

**Verification:**
- [ ] `npm run lint` passes
- [ ] `make test-unit` passes (including new `MarkdownContent.test.tsx` and `MessageBubble.test.tsx`)
- [ ] `make test-integration` passes
- [ ] Manual check: real markdown response (code block + list + emphasis) renders correctly in light and dark themes
- [ ] Manual check: scroll-to-bottom stays pinned during an active streaming response with markdown

**Tests — `MarkdownContent.test.tsx` must cover:**
- [ ] Headings, paragraphs, bold/italic, inline code
- [ ] Nested lists (ordered and unordered)
- [ ] Fenced code block renders in dedicated code surface
- [ ] Fenced code block with language tag exercises syntax highlighter path
- [ ] Fenced code block without language falls back gracefully
- [ ] Indented code block renders correctly
- [ ] `<script>` injection attempt is sanitized
- [ ] `javascript:` href renders as disabled link, not clickable
- [ ] `https:` link renders as clickable and calls `shell.openExternal`
- [ ] `file://` scheme link renders as disabled, does not call `shell.openExternal`
- [ ] Short streaming content (< threshold) renders as plain text
- [ ] Content at/above threshold renders as markdown
- [ ] Malformed / unclosed markdown degrades gracefully (does not crash)

**Tests — `MessageBubble.test.tsx` must cover:**
- [ ] Voice message renders via `MarkdownContent`
- [ ] Conductor message renders via `MarkdownContent`
- [ ] Decryption-failed sentinel renders as `[Message unavailable]`
- [ ] `isThinking` renders animated dots (not markdown)
- [ ] System message renders as plain divider (not markdown)
- [ ] `isStreaming` badge appears during streaming
- [ ] Left/right alignment (`voiceSide`) preserved

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Streaming bubble height grows without scroll compensation | Medium | Medium | Add `streamingContent` to `MessageFeed` scroll `useEffect` deps |
| Unsafe URL scheme passed to `shell.openExternal` | Medium | High | Scheme allowlist (`https`, `http` only) in custom `<a>` renderer |
| Streaming partial markdown looks janky | Low | Medium | `STREAMING_PLAIN_THRESHOLD` constant; react-markdown parses incrementally by default |
| Syntax-highlighting bundle too large | Low | Low | Narrow Prism import; `npm audit`; Electron desktop — 100KB is acceptable |
| `.prose-voice` bleeds into non-message UI | Low | Medium | Scoped to wrapper class; not a global reset |
| `whitespace-pre-wrap` removal changes paragraph spacing | Low | Low | `break-words` remains; markdown `<p>` spacing controlled by `.prose-voice` CSS |
| Malformed AI markdown breaks rendering | Low | Medium | react-markdown is fault-tolerant; add a malformed-input test case |

## Security Considerations

- **Primary protection**: raw HTML never parsed (`rehype-raw` not included). react-markdown
  produces React elements, not innerHTML strings.
- **Defense-in-depth**: `rehype-sanitize` with a custom schema (strips `href` from `<a>` AST
  nodes) runs on all output. Strips `<script>`, event handler attributes, and unsafe nodes even
  if a future plugin were to widen the parser.
- **Link safety**: scheme allowlist in the custom `<a>` renderer — only `https:` and `http:`
  call `window.polyphon.shell.openExternal()`. All other schemes render as inert text. This
  blocks `file://`, `javascript:`, `ms-msdt:`, `tel:`, and other OS-protocol escalation paths
  that could be injected via prompt injection into AI responses.
- **No new IPC channels, no new encrypted fields, no new network paths.**

## Observability & Rollback

- **Post-ship verification**: open a session, send a prompt that produces a fenced code block
  and a bulleted list; confirm formatted rendering in both light and dark themes. Click a
  markdown link; confirm it opens in the system browser. Open devtools; confirm no new CSP
  violations.
- **Rollback**: revert `MessageBubble.tsx` to `{displayContent}` plain text nodes and restore
  `whitespace-pre-wrap`. The `MarkdownContent` component and scoped CSS can remain in place
  without harm. Run `npm uninstall react-markdown rehype-sanitize react-syntax-highlighter`
  if bundle size needs to be recovered.

## Documentation

- [ ] Update `site/data/roadmap.yaml` — flip the "Markdown Rendering" entry from `status: planned`
  to `status: released` with `release_date` set to the actual ship date (post-ship bookkeeping,
  not a sprint blocker)

## Dependencies

None — this sprint is self-contained.

## Open Questions

None — all questions resolved during planning:
- Conductor messages: yes, render markdown
- Syntax highlighting: in scope
- Streaming guard: character threshold at 30 chars (`STREAMING_PLAIN_THRESHOLD`)
