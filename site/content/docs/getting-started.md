---
title: "Getting Started"
weight: 10
description: "Download, install, and launch Polyphon for the first time. Get up and running with your first multi-voice session."
---

This guide walks you through downloading, installing, and launching Polyphon for the first time.

---

## Requirements

- macOS 13+, Windows 10+, or Linux (x64 or arm64)
- At least one voice provider configured — either an API key or a supported CLI tool in your `PATH`

---

## Download

Download the latest release for your platform from the [GitHub Releases page](https://github.com/polyphon-ai/polyphon/releases).

| Platform | File |
|---|---|
| macOS (Apple Silicon) | `Polyphon-*-arm64.dmg` |
| macOS (Intel) | `Polyphon-*-x64.dmg` |
| Windows (x64) | `Polyphon-*-x64-Setup.exe` |
| Windows (arm64) | `Polyphon-*-arm64-Setup.exe` |
| Linux (x86_64) | `Polyphon-*-x64.AppImage` |
| Linux (arm64) | `Polyphon-*-arm64.AppImage` |

---

## Install

### macOS

1. Open the `.dmg` file.
2. Drag **Polyphon** to your Applications folder.
3. On first launch, macOS may show a security prompt — click **Open Anyway** in System Settings → Privacy & Security.

> **Screenshot placeholder:** *macOS DMG window with Polyphon being dragged to Applications*
> <!-- This screenshot requires a manual capture of the macOS DMG installer. It cannot be automated via Playwright. -->

### Windows

Run the installer (`.exe`) and follow the setup wizard. Polyphon will be added to your Start menu.

### Linux

Make the AppImage executable and run it:

```bash
chmod +x Polyphon-*.AppImage
./Polyphon-*.AppImage
```

---

## First Launch

When you open Polyphon for the first time, a welcome dialog appears asking for your name and pronouns. This lets voices address you the way you prefer. Enter a name and click **Get started** — or click **Skip for now** to configure it later in **Settings → Conductor Profile**.

![Polyphon welcome dialog on first launch asking for name and pronouns](/images/screenshots/home/first-launch.webp)

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

Requires Node.js 22+ and npm.
