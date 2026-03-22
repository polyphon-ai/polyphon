---
title: "Polyphon v0.5.0 Released"
description: "Polyphon v0.5.0 is now available for download."
date: "2026-03-22T20:00:52Z"
draft: false
tags: ["release", "announcement"]
categories: ["Announcements"]
---

Polyphon v0.5.0 is now available.

**What's New**
- API voices (Anthropic, OpenAI, OpenAI-compatible) can now use filesystem tools — read files, write files, list directories, search file contents, fetch URLs, and more
- Set a working directory on a session to give voices context about which files to work with
- Enable sandboxing to restrict API voices to only access files within the working directory
- The UI warns you when a session uses CLI voices with sandboxing enabled, since CLI voices run outside the sandbox
- Export any session transcript as Markdown, JSON, or plain text from the session header menu

**Fixed**
- Session header and message bubble layout polish

**Improved**
- Tool path resolution now works correctly for unsandboxed sessions with a working directory set

[Download the latest release](https://polyphon.ai/#download)
