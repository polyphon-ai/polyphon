# Video Scripts

Narration scripts and shot lists for all demo videos referenced in the documentation.

## Format

Each section covers one video. It includes:
- **File path** — where the final `.mp4` and poster `.webp` should be placed
- **Duration target** — approximate target length
- **Shot list** — numbered shots in sequence
- **Narration** — on-screen action described as if narrating to the viewer

All videos should be captured at 1280×800 or 1440×900 (retina-friendly). Use the default light theme unless stated. Do not show real API keys on screen.

---

## Sessions: Message Streaming

**File:** `/videos/docs/sessions-streaming.mp4`
**Poster:** `/images/video-posters/docs/sessions-streaming.webp`
**Duration target:** 20–30 seconds

### Prerequisites

- Active session open with two API voices (e.g. Claude + GPT)
- Voices have not yet responded in this round

### Shot List

1. **(0:00)** Session view visible — message feed empty, input bar focused
2. **(0:02)** Type a short message: `What are the tradeoffs of microservices vs. monoliths?`
3. **(0:04)** Press Enter — both voices begin streaming simultaneously
4. **(0:06–0:22)** Hold on the message feed as tokens stream in from both voices in parallel. Show that you can read partial responses as they arrive.
5. **(0:24)** Both voices finish. Capture the completed round.

### Narration

> "Send a message and all voices respond in parallel — you can read each response as it streams in, without waiting for everyone to finish."

---

## Sessions: @-mention Targeting

**File:** `/videos/docs/sessions-at-mention.mp4`
**Poster:** `/images/video-posters/docs/sessions-at-mention.webp`
**Duration target:** 20–30 seconds

### Prerequisites

- Active session in conductor-directed mode with two named voices (e.g. "Security", "Performance")

### Shot List

1. **(0:00)** Session in conductor-directed mode. Input bar focused.
2. **(0:02)** Type `@` in the input bar — the voice picker dropdown appears listing "Security" and "Performance"
3. **(0:04)** Click or arrow-select "Security"
4. **(0:06)** The voice panel highlights the Security voice; the selected name appears near the input bar
5. **(0:08)** Continue typing: `@Security Is this safe: eval(userInput)`
6. **(0:10)** Press Enter
7. **(0:12–0:22)** Only the Security voice responds. Performance voice stays silent.
8. **(0:24)** Response complete — show only one voice message in the feed.

### Narration

> "Type @ in the input to open the voice picker. Select a voice to direct your message — only that voice responds, while the others stay silent."

---

## Compositions: Voice Type Toggle

**File:** `/videos/docs/compositions-type-toggle.mp4`
**Poster:** `/images/video-posters/docs/compositions-type-toggle.webp`
**Duration target:** 15–20 seconds

### Prerequisites

- Composition Builder open
- Anthropic API key configured; Claude CLI available in PATH

### Shot List

1. **(0:00)** Composition Builder open. Click Add Voice.
2. **(0:02)** Click Anthropic in the provider grid
3. **(0:04)** Voice type toggle visible: API is enabled (key configured), CLI is also enabled (claude in PATH)
4. **(0:06)** Click API to select it — API button highlighted
5. **(0:08)** Click CLI to switch — CLI button highlighted
6. **(0:10)** Now remove the Claude CLI from PATH (or simulate unavailability by showing tooltip) — CLI button appears disabled with tooltip "claude not found"
7. **(0:14)** End on the API button selected and active.

### Narration

> "The voice type toggle shows what's available based on your configuration. If an API key isn't set or a CLI binary isn't in your PATH, that option is disabled — preventing voices that would fail at runtime."

---

## Continuation Policy: Prompt Me

**File:** `/videos/docs/continuation-nudge.mp4`
**Poster:** `/images/video-posters/docs/continuation-nudge.webp`
**Duration target:** 25–35 seconds

### Prerequisites

- Composition with Broadcast mode and "Prompt me" continuation configured
- API voices configured and ready
- Fresh session from that composition (no prior messages)

### Shot List

1. **(0:00)** Session open in broadcast mode. Input bar focused.
2. **(0:02)** Send a message: `What makes a good API design?`
3. **(0:04–0:18)** Both voices respond. First round completes.
4. **(0:20)** Amber nudge banner appears at the bottom of the feed: "Agents have more to say — let them continue?"
5. **(0:22)** Hover over the Allow button briefly
6. **(0:24)** Click **Allow** — second round begins, voices start streaming again
7. **(0:28)** Second round completes. Nudge banner no longer visible.

### Narration

> "With 'Prompt me' continuation, after each round completes you're asked whether to continue. Click Allow to start the next round, or Dismiss to stop."

---

## Custom Provider Setup: Ollama

**File:** `/videos/docs/custom-provider-ollama.mp4`
**Poster:** `/images/video-posters/docs/custom-provider-ollama.webp`
**Duration target:** 40–50 seconds

### Prerequisites

- Ollama installed and running locally with llama3.2 pulled
- `ollama serve` running at localhost:11434
- Settings open

### Shot List

1. **(0:00)** Settings → Custom Providers tab visible; no custom providers yet
2. **(0:02)** Click **Add Custom Provider**
3. **(0:04)** Fill in Name: "Local Ollama"
4. **(0:07)** Fill in Base URL: `http://localhost:11434/v1`
5. **(0:10)** Leave API key env var blank
6. **(0:12)** Click **Fetch Models** — model list populates (llama3.2 visible)
7. **(0:16)** Select llama3.2 as default model
8. **(0:18)** Click **Save**
9. **(0:20)** Provider card appears in the Custom Providers tab; auth-less badge visible
10. **(0:23)** Navigate to Composition Builder → Add Voice
11. **(0:25)** Provider grid shows "Local Ollama" with CUSTOM · API label alongside built-in providers
12. **(0:28)** Click Local Ollama — voice configuration panel opens; llama3.2 pre-selected
13. **(0:32)** Fill in display name "Llama" and click outside to confirm
14. **(0:35)** Click Save, then Start Session from the composition
15. **(0:38)** Send a short message — Llama voice responds

### Narration

> "Add any OpenAI-compatible endpoint as a custom provider. Fill in the name and base URL, fetch available models, and save. The provider appears in the Composition Builder alongside built-in voices — no app restart needed."
