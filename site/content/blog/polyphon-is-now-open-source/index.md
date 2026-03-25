---
title: "Polyphon is Now Open Source"
description: "Polyphon is now public on GitHub under Apache 2.0. Here's why local-first software that handles your real work should be inspectable — and why keeping the repo private stopped making sense."
date: "2026-03-24T21:55:00-0400"
draft: false
tags: ["open-source", "announcement", "local-first", "transparency"]
categories: ["Announcements", "Open Source", "Community"]
aliases: ["/posts/polyphon-is-now-open-source/"]
image: "polyphon-is-now-open-source.webp"
---
{{< figure-float src="polyphon-is-now-open-source.webp" alt="A woman coding on a laptop at a desk with a security padlock nearby" >}}

## Polyphon is the kind of software that should be open to inspection.

**As of today, Polyphon is open source on GitHub under the Apache 2.0 license.**

I kept the repo private while I figured out the business question: subscription, one-time purchase, freemium, or something else. I never got a clear answer. What I got instead was a growing understanding that the pricing question was the wrong frame. The real question was about trust.

## Local-first software asks for a different kind of trust.

Polyphon sits close to the work. People use it with drafts, codebases, notes, research, and half-formed ideas. They connect it to paid APIs, point it at local models, and let CLI tools run inside real projects. That is not the kind of software where "just trust me" is a satisfying answer.

Open source is not a magic spell. Public code does not automatically make software safe, private, or well-designed. But it does something important: it replaces mystery with inspectability.

If I say Polyphon is local-first, you should be able to verify what that means. If I say there is no telemetry, you should be able to check. If I say your sessions, compositions, and settings stay on your machine, that should not depend on marketing copy being accurate — it should be visible in the code itself.

That was the argument that kept winning every time I thought about this.

## Why the repo stayed private — and why that stopped making sense.

There is a kind of private development that makes sense early on. You need space to build something rough before turning the lights on. I don't think every project should start in public.

But there is a point where privacy mostly protects hesitation.

Polyphon was already real enough to use daily, release publicly, and ask people to build workflows around. People were already evaluating whether to trust it with their work. At that point, a private repo wasn't helping the project mature — it was creating distance between the project and the people using it.

The two costs that mattered most: readers couldn't inspect implementation details to decide whether the local-first claims held up, and they couldn't judge whether the project was serious or abandoned without relying entirely on the story the website tells.

Open source closes most of that gap.

## What is public now.

The actual project: the desktop app, the release history, the docs, the security policy, the issue templates, and the public roadmap tracking what's shipped and what's coming.

GitHub Issues and Discussions are open. The roadmap is public. GitHub Sponsors is enabled for anyone who wants to support the project financially.

One thing I want to be precise about: **Polyphon is not currently accepting pull requests.** That may change. Opening the code right now is about transparency, forkability, and shared visibility. If you want to engage, issues and discussions are the right channel. Forks are welcome.

## Why Apache 2.0.

I wanted a permissive license that was familiar, unambiguous, and included an explicit patent grant. Apache 2.0 checks all three. The patent grant matters in an ecosystem that moves fast and has a complicated relationship with intellectual property.

More practically: if Polyphon is useful, I want it to be easy for other people to build on. A fork, a plugin ecosystem, someone adapting ideas for a different workflow — I don't need to control all of that to feel good about the work.

## What is still undecided.

Going open source is a beginning, not an answer.

The things I don't know yet: whether the main value here will be trust, visibility, or bug reports from people who can now read the code. Whether I'll ever formalize a contribution model or whether this stays mostly solo-built with public source. What sustainability looks like for a free, local-first desktop app.

What I do know is that waiting for clarity was not helping. Polyphon is built for people piecing together their own AI workflows — mixing providers, mixing local and cloud models, staying in control of their environment. That audience tends to care how things work. They should be able to see.

## Get involved.

If you haven't tried Polyphon:

**[Download Polyphon](https://polyphon.ai/#download)** — macOS, free.

If you already use it, [star the repo](https://github.com/polyphon-ai/polyphon) — it helps other people find the project. If you've hit something broken or want to push on the product direction, [open an issue](https://github.com/polyphon-ai/polyphon/issues). If you want to talk through how you're using it or what you'd want it to do, [join the discussion](https://github.com/polyphon-ai/polyphon/discussions).

The source is there. The license is permissive. The roadmap is public. What gets built from here is something I'd rather figure out in the open.

---

*When a tool touches your drafts, code, or notes, what would you want to verify for yourself?*
