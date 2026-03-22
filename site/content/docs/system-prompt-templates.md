---
title: "System Prompt Templates"
weight: 60
description: "Save and reuse system prompts across voices and compositions with system prompt templates in Polyphon."
---

A **system prompt template** is a saved, reusable system prompt that can be attached to any voice in a composition. Instead of retyping the same prompt in every voice configuration, create it once and attach it wherever you need it.

---

## Why Use Templates

- **Consistency** — every voice using the "Security Reviewer" template gets the same instructions, with no risk of copy-paste drift.
- **Single update point** — change a template once and it applies to every new session that uses it. Existing sessions retain their snapshot.
- **Reuse across compositions** — the same template can be attached to voices in multiple compositions.

---

## Creating a Template

1. Go to **Settings → Templates**.
2. Click **Add Template**.
3. Fill in:
   - **Name** — a short label shown in the template picker (e.g. "Security Reviewer")
   - **Content** — the full system prompt text
4. Click **Save**.

> **Screenshot placeholder:** Templates — Settings → Templates tab showing the saved template list with names and content previews
<!-- Prerequisites: Settings → Templates tab open, at least 2 templates saved | Platform: any | Theme: any | Window: default -->

> **Screenshot placeholder:** Templates — template creation form with "Security Reviewer" name and content filled in
<!-- Prerequisites: Settings → Templates tab, Add Template form open | Platform: any | Theme: any | Window: default -->

---

## Editing and Deleting Templates

On any template in **Settings → Templates**, click **Edit** to update its name or content, or **Delete** to remove it.

**Important:** Editing a template affects new sessions only. Sessions that have already been started retain a snapshot of the template content at the time the voice was created — they are not affected by later template edits.

---

## Attaching a Template to a Voice

When adding a voice in the Composition Builder:

1. In the voice configuration panel, locate the **System prompt template** dropdown (labeled "optional").
2. Select a template from the list.
3. The system prompt textarea below is pre-filled with the template content, and a **"Template attached"** badge appears next to the dropdown.

> **Screenshot placeholder:** Compositions — voice configuration panel with the "Security Reviewer" template attached; "Template attached" badge visible, system prompt textarea pre-filled with template content
<!-- Prerequisites: Composition Builder open, voice added, template selected from dropdown | Platform: any | Theme: any | Window: default -->

### Detaching a template

If you edit the system prompt textarea after attaching a template, the voice is automatically detached from the template and goes inline. The hint below the textarea reads: "Editing this field detaches the voice from any selected template." To re-attach, select the template again from the dropdown.

---

## Template vs. Inline System Prompt

| | Template | Inline |
|---|---|---|
| **Stored as** | Reference to template ID + content snapshot | Text in the composition voice record |
| **Future edits affect it?** | No — sessions use snapshot at creation time | N/A |
| **How to set** | Template dropdown in voice config | Type directly in the system prompt textarea |
| **How to switch** | Select template; editing textarea detaches it | Edit textarea (detaches any attached template) |

---

## Cross-links

- [Compositions](../compositions/) — attaching templates to voices in the Composition Builder
