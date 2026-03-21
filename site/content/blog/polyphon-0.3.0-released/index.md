---
title: "Polyphon v0.3.0 Released"
description: "Polyphon v0.3.0 is the first stable release in the 0.3 series, bringing auto-updates, improved reliability, and a polished experience."
date: "2026-03-20T21:04:59-04:00"
draft: false
tags: ["release", "announcement"]
categories: ["Announcements"]
---

Polyphon v0.3.0 is now available — the first stable release in the 0.3 series.

This release graduates everything from the v0.3.0 alpha cycle into a stable build, including in-app auto-updates, encryption at rest, YOLO mode, and a significantly hardened security foundation.

## What's New

- In-app auto-update powered by electron-updater with channel support (stable, alpha, beta)
- Update download errors are now surfaced in the UI
- app-update.yml is bundled into the packaged app as an extra resource
- Pre-release flag is preserved correctly for alpha and beta GitHub releases
- Added RELEASE_NOTES.md as the source of truth for GitHub release bodies

## Fixes

- Fixed updater error surfaces and allowPrerelease handling for pre-release installs

[Download the latest release](https://polyphon.ai/#download)
