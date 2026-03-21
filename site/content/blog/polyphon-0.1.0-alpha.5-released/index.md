---
title: "Polyphon v0.1.0-alpha.5 Released"
description: "Polyphon v0.1.0-alpha.5 is now available for download."
date: "2026-03-17T23:13:05-04:00"
draft: false
tags: ["release", "announcement"]
categories: ["Announcements"]
---

Polyphon v0.1.0-alpha.5 is now available.

## What's New

- Added AES-256-GCM at-rest encryption with branded types and a CI gate to prevent plaintext writes
- Encrypted conductor avatar, tones descriptions, message metadata, and CLI voice commands at rest
- Added IPC argument validation helpers to harden all settings and session handlers
- Added function-level and constructor-time CLI command validation to prevent command injection
- Hardened GitHub API response parsing with strict fetch-layer validation
- Raised scrypt N to 65536 for stronger password-based key wrapping
- Fixed CLI voice non-interactive flags for claude and codex providers
- Fixed copilot provider to write prompts to stdin instead of using flags
- Fixed macOS CSP meta tag conflict with Vite HMR in development
- Fixed shell environment parsing to use NUL delimiter for robustness
- Added 10-second timeout to update checker requests
- Switched Linux packaging from AppImage to deb/rpm
- Added SmartScreen tip to the Windows download card

[Download the latest release](https://polyphon.ai/#download)
