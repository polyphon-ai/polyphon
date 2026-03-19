# Screenshot Capture Script

This guide provides step-by-step instructions for capturing all documentation screenshots in a single session. Follow the steps in order — later steps depend on app state set up by earlier steps.

## Prerequisites

- Node.js 24+
- `npm install` completed
- At least one API key available (Anthropic recommended)
- Run `make dev` and confirm the app opens cleanly
- **Window size:** Use the default window size unless stated otherwise
- **Theme:** Capture in the default theme unless stated otherwise
- **API keys:** Never show a real key on screen. Use a placeholder value or blur/crop the key field.

---

## Seed Data Setup

Before capturing screenshots, set up the following seed data in the running app.

### 1. Conductor profile

In Settings → Conductor Profile:
- Upload a neutral stock avatar photo (crop to show face, centered)
- Name: `Alex`
- Pronouns: `they/them`
- Default tone: **Collaborative**
- Background: `Senior backend engineer exploring AI tooling.`

### 2. Custom provider

In Settings → Custom Providers, add:
- Name: `Local Ollama`
- Base URL: `http://localhost:11434/v1`
- API key env var: *(leave blank)*

(Ollama does not need to be running for screenshots of the form.)

### 3. System prompt templates

In Settings → Templates, create two templates:
- **Security Reviewer** — "Review the following for security vulnerabilities. Focus on OWASP Top 10. Be specific about the risk and the fix."
- **Performance Optimizer** — "Review the following for performance issues. Focus on time complexity, memory usage, and I/O bottlenecks."

### 4. Custom tone

In Settings → Tones, create one custom tone:
- Name: `Socratic`
- Description: `Answers questions with questions to promote reasoning.`
- Instructions: `Do not give direct answers. Instead, ask guiding questions that help the user reason to the answer themselves.`

### 5. Compositions

Create three compositions:

**Composition A: "Code Review Panel"**
- Mode: Broadcast
- Continuation: Prompt me
- Voice 1: Anthropic · Claude Sonnet 4.6 · "Security" · red color · Security Reviewer template
- Voice 2: Anthropic · Claude Sonnet 4.6 · "Performance" · blue color · Performance Optimizer template

**Composition B: "Quick Brainstorm"**
- Mode: Broadcast
- Continuation: None
- Voice 1: Anthropic · Claude Sonnet 4.6 · "Claude" · indigo color

**Composition C: "Deep Dive"**
- Mode: Broadcast
- Continuation: Auto · Max rounds: 2
- Voice 1: Anthropic · Claude Sonnet 4.6 · "Claude" · indigo color
- Voice 2: OpenAI · GPT-4o · "GPT" · green color

---

## Capture Sequence

### getting-started — macOS install

**File:** `home/install-macos-dmg.webp`

1. Download the latest `.dmg` from GitHub Releases (or use a placeholder mounted DMG).
2. Open Finder; mount the DMG so the drag-to-Applications window appears.
3. Capture the DMG window showing the Polyphon icon being dragged to Applications.

---

### getting-started — onboarding

**File:** `home/onboarding-welcome.webp`

1. Clear the onboarding localStorage flag: in DevTools console, run `localStorage.removeItem('polyphon.onboardingComplete')`.
2. Reload the app.
3. The welcome dialog should appear.
4. Do **not** fill in any fields yet — capture the empty state showing all visible fields (avatar button, name, pronouns, About me textarea, Get started, Skip for now).

---

### concepts — composition list

**File:** `compositions/concepts-composition-list.webp`

1. Confirm all three compositions from seed data are visible in the sidebar.
2. Capture the sidebar with all three composition names visible.

---

### concepts — active session

**File:** `sessions/concepts-active-session.webp`

1. Open "Code Review Panel" and click Start Session.
2. Send the message: `Review this: const password = "hunter2"`
3. Wait for both voices to finish responding.
4. Capture the full session view showing both voice message bubbles with their names, colors, and avatar icons visible.

---

### sessions — new session button

**File:** `sessions/new-button.webp`

1. Return to the main window.
2. Capture the sidebar header area showing the + (new session) button.

---

### sessions — new session panel

**File:** `sessions/new-panel.webp`

1. Click the + button to open the new session panel.
2. Capture the panel showing the composition picker with at least one composition visible.

---

### sessions — full session view

**File:** `sessions/full-view.webp`

1. Open the active "Code Review Panel" session from above.
2. Capture the full session view: message feed with both voice bubbles, voice panel on the right showing status, input bar at the bottom.

---

### sessions — conductor-directed mode

**File:** `sessions/conductor-mode-voice-panel.webp`

1. In the active session, switch to conductor-directed mode using the mode selector in the voice panel header.
2. Click the "Security" voice to target it.
3. Capture the session header showing the "Directed" badge, with the Security voice highlighted in the voice panel.

---

### sessions — continuation nudge

**File:** `sessions/continuation-nudge.webp`

1. Open the "Code Review Panel" composition (which uses "Prompt me" continuation).
2. Start a new session.
3. Send a message and wait for both voices to complete the first round.
4. The amber continuation nudge banner should appear.
5. Capture the banner showing "Agents have more to say — let them continue?" with Allow and Dismiss buttons.

---

### compositions — sidebar new composition button

**File:** `compositions/sidebar-new-button.webp`

1. Capture the sidebar showing the New Composition button below the session list.

---

### compositions — builder empty state

**File:** `compositions/builder-empty.webp`

1. Click New Composition.
2. Capture the builder in empty state: name field, Conductor-Directed / Broadcast mode selector buttons, continuation policy (if Broadcast selected), and Add Voice button.

---

### compositions — continuation policy (Auto)

**File:** `compositions/builder-continuation-auto.webp`

1. In the Composition Builder, click Broadcast mode.
2. Click the Auto continuation option.
3. Confirm the Max rounds slider is visible.
4. Capture the Broadcast mode section showing the three continuation policy cards (None, Prompt me, Auto highlighted) and the Max rounds slider.

---

### compositions — voice configuration

**File:** `compositions/builder-voice-config-full.webp`

1. In the Composition Builder, add a voice.
2. Select Anthropic, choose Claude Sonnet 4.6.
3. Fill in display name "Security", select the red color swatch, attach the Security Reviewer template.
4. Capture the voice configuration panel with all fields visible and filled.

---

### compositions — template attached badge

**File:** `compositions/builder-template-attached.webp`

1. In a voice configuration panel, select the Security Reviewer template from the template dropdown.
2. Capture showing the "Template attached" badge and the pre-filled system prompt textarea.

---

### compositions — drag handles

**File:** `compositions/builder-drag-handles.webp`

1. In the Composition Builder with two voices added, capture the voice list showing the drag handles on each row.

---

### compositions — detail view

**File:** `compositions/detail-start-session.webp`

1. Click the "Code Review Panel" composition in the sidebar.
2. Capture the detail view showing the composition name, voice list, mode, continuation policy, and Start Session button.

---

### compositions — context menu

**File:** `compositions/context-menu.webp`

1. Right-click the "Quick Brainstorm" composition in the sidebar.
2. Capture the context menu showing Archive and Delete options.

---

### compositions — custom provider in builder

**File:** `compositions/builder-custom-provider-voice.webp`

1. Open the Composition Builder.
2. Click Add Voice.
3. Capture the provider grid showing the three built-in providers plus the "Local Ollama" custom provider with the CUSTOM · API label.

---

### providers — Anthropic card expanded

**File:** `settings/providers-tab-anthropic-expanded.webp`

1. Open Settings → Providers.
2. Expand the Anthropic card.
3. Capture showing the voice type selector, API key field (key masked or placeholder), and Test button.

---

### providers — Claude CLI available

**File:** `settings/providers-tab-cli-available.webp`

1. Confirm the `claude` CLI is installed on this machine.
2. Open Settings → Providers.
3. Capture the Claude CLI card showing the "Available" status indicator.

---

### providers — all provider status cards

**File:** `settings/providers-status-cards.webp`

1. Open Settings → Providers with a mix of configured (Anthropic key saved) and unconfigured (OpenAI not configured) providers.
2. Capture the full Providers tab showing multiple cards in different states.

---

### settings — overview with all tabs

**File:** `settings/settings-overview.webp`

1. Open Settings.
2. Capture the full settings view with the tab navigation showing all six tabs: Providers, Custom Providers, Tones, Templates, Conductor Profile, About.

---

### settings — About page

**File:** `settings/about-page.webp`

1. Open Settings → About.
2. Use a beta or alpha build to show the expiry countdown and waveform animation.
3. Capture showing the version badge, channel badge, waveform animation, and countdown.

---

### conductor profile — empty state

**File:** `settings/conductor-profile-empty.webp`

1. Open Settings → Conductor Profile with no profile set (fresh install or cleared profile).
2. Capture the empty state showing the avatar button, all fields empty.

---

### conductor profile — AvatarEditor

**File:** `settings/avatar-editor.webp`

1. In Settings → Conductor Profile, click the avatar button.
2. Select a stock photo.
3. The AvatarEditor modal opens.
4. Capture the modal showing the circular crop preview, zoom slider, rotate buttons, and Apply / Cancel buttons.

---

### conductor profile — filled

**File:** `settings/conductor-profile.webp`

1. With the conductor profile fully filled in (avatar, name, pronouns, background from seed data).
2. Capture the Conductor Profile tab with all fields populated.

---

### custom providers — add form

**File:** `settings/custom-providers-add-form.webp`

1. Open Settings → Custom Providers → Add Custom Provider.
2. Fill in: Name "Local Ollama", Base URL "http://localhost:11434/v1", API key env var blank.
3. Capture the filled-in form before saving.

---

### custom providers — tab with saved provider

**File:** `settings/custom-providers-tab.webp`

1. After saving the Local Ollama provider, capture the Custom Providers tab.
2. The auth-less badge ("No API key required (auth-less endpoint)") should be visible on the card.

---

### tones — built-in tones

**File:** `settings/tones-tab-builtins.webp`

1. Open Settings → Tones.
2. Capture the five built-in tone cards with names, descriptions, and Edit / Delete buttons.

---

### tones — add form

**File:** `settings/tones-add-form.webp`

1. Click Add Tone.
2. Fill in the Socratic tone from seed data.
3. Capture the form with all fields filled.

---

### tones — with custom tone

**File:** `settings/tones-tab-with-custom.webp`

1. After saving the Socratic custom tone, capture the Tones tab showing all five built-in tones plus the Socratic custom tone.

---

### tones — voice tone dropdown

**File:** `compositions/builder-tone-dropdown.webp`

1. Open the Composition Builder and add a voice.
2. Click the Tone dropdown to open it.
3. Capture the dropdown open showing "Use conductor default" at the top plus all built-in and custom tones in the list.

---

### templates — tab

**File:** `settings/templates-tab.webp`

1. Open Settings → Templates.
2. Capture the tab showing the Security Reviewer and Performance Optimizer templates with names and content previews.

---

### templates — add form

**File:** `settings/templates-add-form.webp`

1. Click Add Template.
2. Fill in the Security Reviewer template from seed data.
3. Capture the form with name and content filled.
