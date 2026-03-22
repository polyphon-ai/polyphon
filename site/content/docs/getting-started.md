---
title: "Getting Started"
weight: 10
description: "Download, install, and launch Polyphon for the first time. Get up and running with your first multi-voice session."
---

This guide walks you through downloading, installing, and launching Polyphon for the first time.

---

## Requirements

- macOS 13+ on Apple Silicon (arm64)
- At least one voice provider configured — either an API key or a supported CLI tool in your `PATH`

---

## Download

Download the latest release from [polyphon.ai](https://polyphon.ai/#download).

| Platform | File |
|---|---|
| macOS (Apple Silicon) | `Polyphon-*-arm64.dmg` |

---

## Install

1. Open the `.dmg` file.
2. Drag **Polyphon** to your Applications folder.
3. On first launch, macOS may show a security prompt — click **Open Anyway** in System Settings → Privacy & Security.

---

## First Launch

When you open Polyphon for the first time, a welcome dialog appears. This is your chance to set up your conductor profile — how voices will address you — before starting your first session.

![Polyphon welcome dialog on first launch showing avatar button, name field, pronouns dropdown, and About me textarea](/images/screenshots/home/onboarding-welcome.webp)
<!-- Prerequisites: fresh install with no prior profile | Platform: any | Theme: any | Window: default -->

The welcome dialog lets you set:

- **Avatar** — click the circular button to upload a photo. After selecting a file, the crop editor opens so you can reposition and zoom the image before confirming. The avatar appears in the sidebar next to your name.
- **Name** — how voices address you (up to 25 characters). This field is required to click **Get started**.
- **Pronouns** — your preferred pronouns, injected into every voice's system prompt. Optional.
- **About me** — free-form background context (up to 250 characters). Optional.

Click **Get started** to save your profile and open the main window. Click **Skip for now** to proceed without setting a profile — you can configure it later in **Settings → Conductor Profile**.

After the welcome dialog, you will see the main window with an empty sidebar. Before starting your first session, you need at least one voice provider configured. Go to **Settings** (gear icon in the bottom-left corner) and add your first provider.

See [Voice Providers](../providers/) for step-by-step instructions.

---

## Build from Source

If you prefer to build Polyphon yourself:

```bash
git clone https://github.com/polyphon-ai/polyphon.git
cd polyphon
npm install
make dev        # run in development mode
make build      # build a production binary
```

Requires Node.js 24+ and npm.
