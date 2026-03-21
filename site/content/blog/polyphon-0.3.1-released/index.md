---
title: "Polyphon v0.3.1 Released"
description: "Polyphon v0.3.1 is now available for download."
date: "2026-03-20T21:35:38-04:00"
draft: false
tags: ["release", "announcement"]
categories: ["Announcements"]
---

Polyphon v0.3.1 is now available.

## What's New

- Each database migration is now applied atomically — the schema version bump and the migration itself commit together, so a crash mid-migration leaves the database in a clean, re-runnable state
- Fixed an edge case where duplicate-column migrations could fail after a partial-migration crash

[Download the latest release](https://polyphon.ai/#download)
