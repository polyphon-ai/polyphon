# Contributing to Polyphon

Thank you for your interest in contributing. Polyphon is an open source project and all contributions are welcome — bug reports, feature ideas, documentation improvements, and code.

---

## Before You Start

- Check [existing issues](https://github.com/coreydaley/polyphon/issues) to avoid duplicating effort.
- For significant new features, open an issue to discuss the approach before writing code.
- Read [CLAUDE.md](CLAUDE.md) for project conventions and domain vocabulary.

---

## Development Setup

> Build instructions will be added as the tech stack is finalized.

---

## Submitting Changes

1. Fork the repository and create a branch from `main`.
2. Make your changes. Keep commits focused and atomic.
3. Follow the [Conventional Commits](https://www.conventionalcommits.org/) format:
   ```
   <type>(<scope>): <short summary>
   ```
   Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`, `ci`
4. Open a pull request against `main`. Fill out the PR template completely.
5. A maintainer will review your PR. Address any feedback.

---

## Code Conventions

- Use the domain vocabulary from [CLAUDE.md](CLAUDE.md) consistently (voice, composition, session).
- Prefer editing existing files over creating new ones.
- Do not add comments unless the logic is non-obvious.
- Never commit secrets, credentials, or `.env` files.
- New voice provider? Follow the provider pattern described in [CLAUDE.md](CLAUDE.md).

---

## Reporting Bugs

Use the **Bug Report** issue template. Include:
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, version)

---

## Suggesting Features

Use the **Feature Request** issue template. Explain the problem you're solving and why it fits Polyphon's goals.

---

## Code of Conduct

All contributors are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
