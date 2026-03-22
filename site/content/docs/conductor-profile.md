---
title: "Conductor Profile"
weight: 40
description: "Set your avatar, name, pronouns, and background context so every voice in every session knows who they're talking to."
---

The **Conductor Profile** is information about you that Polyphon injects into the system prompt of every voice in every session. Set it once, and all your voices will know who they are talking to.

---

## Setting Your Profile

Open **Settings** (gear icon, bottom-left) and click the **Conductor Profile** tab.

> **Screenshot placeholder:** Conductor Profile — Settings → Conductor Profile tab showing avatar button, name, pronouns, default tone, and background fields in their default (empty) state
<!-- Prerequisites: Settings open on Conductor Profile tab with no profile set | Platform: any | Theme: any | Window: default -->

---

## Avatar

The circular avatar button at the top of the Conductor Profile section shows your photo (or an empty placeholder if none is set). To upload a photo:

1. Click the avatar button.
2. A file picker opens. Select an image file (PNG, JPG, GIF, or WebP).
3. The **Avatar Editor** opens with your selected image.

> **Screenshot placeholder:** Conductor Profile — AvatarEditor modal open with a photo loaded; circular crop preview visible with drag-to-reposition instructions, zoom slider, and rotate buttons; Cancel and Apply buttons at bottom
<!-- Prerequisites: photo selected from file picker, AvatarEditor modal open | Platform: any | Theme: any | Window: default -->

In the Avatar Editor you can:

- **Drag** the image to reposition it within the circular crop area.
- **Scroll** (or use the zoom slider) to zoom in or out (0.2× to 6×).
- **Rotate** the image in 90° increments using the rotate buttons.

Click **Apply** to confirm the crop. The cropped avatar (200×200 px) is saved to your profile and appears next to your name in the sidebar.

To remove your avatar, click the **×** button on the avatar preview.

---

## Profile Fields

### Name

How voices should address you. If left blank, voices will not use a name when addressing you.

**Example:** `Alex`

(Max 25 characters)

### Pronouns

Your preferred pronouns. Voices will use these when referring to you. Choose from the dropdown or leave blank.

**Options:** she/her, he/him, they/them, she/they, he/they, ze/zir, xe/xem, any/all, prefer not to say

### Background

Free-form context about who you are, your role, or what you typically use Polyphon for. This context is included in every voice's system prompt so voices can tailor their responses to your background.

**Example:**
> I'm a backend engineer with 10 years of experience, primarily working in Go and Python. I'm currently exploring AI tooling and agent orchestration.

(Max 250 characters)

### Default Tone

The tone preset applied to voices that don't have a specific tone set. Choose from:

| Tone | Description |
|---|---|
| **Professional** | Formal, precise, business-appropriate |
| **Collaborative** | Warm, inclusive, builds on your ideas |
| **Concise** | Brief and direct — minimal words, maximum signal |
| **Exploratory** | Open-ended, curious, surfaces possibilities |
| **Teaching** | Patient, explains from first principles |

---

## How the Profile Is Used

When a session starts, Polyphon builds a system prompt for each voice that includes:

1. The voice's own system prompt (if any)
2. The ensemble context — who the other voices are in the session
3. Your conductor profile (name, pronouns, background, tone)

This means every voice knows who you are and how to communicate with you, without you having to repeat it in every message.

---

## Privacy

Your conductor profile is stored locally in your Polyphon database. It is sent to voice providers as part of the system prompt when you start a session, just as any system prompt would be. It is not shared with anyone else or stored externally.

---

## Auto-save

The Conductor Profile saves automatically when you leave a field (on blur). There is no explicit save button — your changes take effect immediately for the next session you start.

> **Screenshot placeholder:** Conductor Profile — Settings → Conductor Profile tab with avatar photo, name, pronouns, and background context all filled in
<!-- Prerequisites: all profile fields populated, avatar photo uploaded and cropped | Platform: any | Theme: any | Window: default -->

