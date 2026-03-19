# Sprint 014: macOS arm64 Cleanup — Remove Cross-Platform Residue

## Sprint Theme

**Make Polyphon's docs and configuration tell the truth: this is a macOS Apple Silicon
app, not a cross-platform product with a half-removed past.**

---

## Overview

The platform-drop commits (`adca59b`→`1e54229`) already did the hard work: AppImage maker,
`--no-sandbox` hook, Linux/Windows CI jobs, Docker build targets, and multi-platform
Makefile targets are all gone. `forge.config.ts` is clean — MakerDMG with `['darwin']`
filter only. The release pipeline builds and publishes a single macOS arm64 DMG.

The remaining problem is narrative drift: a handful of developer- and user-facing surfaces
still describe the old multi-platform world. This gives contributors the wrong mental model,
gives Claude permission to suggest Windows/Linux patterns, and tells users the product
ships on platforms it doesn't.

This sprint is intentionally small and documentation-heavy. No `src/` runtime changes, no
schema changes, no new npm dependencies.

---

## Use Cases

1. **New contributor reads README** — they see "macOS (Apple Silicon)" in Installation
   and understand there are no Windows or Linux builds.
2. **Claude reads CLAUDE.md** — the Code Signing Policy describes macOS only; Claude
   won't suggest Authenticode or Flatpak patterns.
3. **User files a bug report** — the GitHub template reflects the actual support boundary.
4. **Release tag is pushed** — the GitHub Release body is accurate; no "for your platform"
   text that implies multi-platform artifact selection.
5. **User reads the site getting-started doc** — download wording matches reality.

---

## Terminology Standard

The canonical phrase for user-facing content is **"macOS (Apple Silicon)"**. Engineering
docs (Makefile comments, release workflow step names, CLAUDE.md internals) may use
"macOS arm64" or "arm64" where conciseness matters. "macOS 13+ on Apple Silicon (arm64)"
is the full requirement form used in prerequisites. This sprint should converge all edited
surfaces on these forms; avoid "macOS" alone where hardware architecture matters to the
reader.

---

## Architecture

No runtime changes. All changes are in surface-layer files:

```
README.md                                  — install + release pipeline description
CLAUDE.md                                  — Code Signing Policy
.github/ISSUE_TEMPLATE/bug_report.yml      — OS dropdown
.github/workflows/release.yml             — GitHub Release body text
site/content/docs/getting-started.md      — download phrasing
site/content/docs/providers.md            — screenshot comment
```

**Intentional non-changes:**
- `forge.config.ts` — already macOS-only via DMG maker filter `['darwin']`; no arch lock
  added (Makefile `dist` and CI already enforce `--arch arm64` where it matters)
- `package.json` — generic `npm run make` remains a local Forge command, not the release
  contract
- Completed sprint docs — append-only historical records; not edited

---

## Implementation Plan

### P0: Must Ship

#### 1. Update `README.md` — Installation section

**Files:** `README.md`

**Tasks:**
- [ ] Replace line 41. Before:
  ```
  Pre-built installers for macOS, Windows, and Linux are available on the [Releases](...) page.
  ```
  After:
  ```
  Pre-built installers for **macOS (Apple Silicon)** are available on the [Releases](...) page.
  ```
- [ ] Verify no other Windows/Linux references remain in the Installation section

#### 2. Update `README.md` — Releasing section

**Files:** `README.md`

**Tasks:**
- [ ] Replace the numbered release pipeline list. Before:
  ```
  1. **Test** — lint, unit, integration, and e2e tests across macOS, Windows, and Linux
  2. **Build** — creates installers for all six platform/arch targets
  3. **Publish** — attaches installers to a GitHub Release in `polyphon-ai/releases`
  4. **Update site** — bumps `downloadVersion` in `site/hugo.yaml`, creates a release
     announcement blog post, and pushes to `main` (which triggers a site redeploy)
  ```
  After:
  ```
  1. **Test** — lint, unit, integration, and e2e tests on macOS
  2. **Build** — creates the macOS arm64 DMG
  3. **Publish** — attaches the DMG to a GitHub Release in `polyphon-ai/releases`
  4. **Update site** — bumps `downloadVersion` in `site/hugo.yaml` and pushes to `main`
     (which triggers a site redeploy)
  ```

#### 3. Update `CLAUDE.md` — Code Signing Policy

**Files:** `CLAUDE.md`

**Tasks:**
- [ ] Replace the Code Signing Policy section. Before:
  ```markdown
  Polyphon is **not enrolled in any developer signing program** on any platform:

  - **macOS** — not enrolled in the Apple Developer Program; the app is unsigned and
    unnotarized. Do not use or recommend APIs, features, or patterns that require a signed
    or notarized app (e.g. `safeStorage`, Hardened Runtime entitlements, App Sandbox).
  - **Windows** — no Authenticode certificate. Do not implement or suggest anything that
    requires a signing certificate (e.g. MSIX packaging, SmartScreen bypass flows).
  - **Linux** — no distribution signing (no Snap store signing, no Flatpak GPG key). Do
    not assume a sandboxed or signed package format.

  This is a permanent constraint, not a temporary alpha limitation. Any feature that would
  only work correctly in a signed context must be avoided or designed around.
  ```
  After:
  ```markdown
  Polyphon is **not enrolled in the Apple Developer Program**. The app is unsigned and
  unnotarized on macOS. Do not use or recommend APIs, features, or patterns that require a
  signed or notarized app (e.g. `safeStorage`, Hardened Runtime entitlements, App Sandbox).

  This is a permanent constraint, not a temporary alpha limitation. Any feature that would
  only work correctly in a signed context must be avoided or designed around.
  ```
- [ ] Do NOT touch the Logging section — it is already clean (no Linux/Windows references)

#### 4. Update `.github/ISSUE_TEMPLATE/bug_report.yml` — remove OS dropdown

**Files:** `.github/ISSUE_TEMPLATE/bug_report.yml`

**Tasks:**
- [ ] Remove the entire `os` dropdown field (the block starting with `- type: dropdown` /
  `id: os` through `validations: required: false`). With one supported platform, the
  dropdown adds no diagnostic value.

#### 5. Update `.github/workflows/release.yml` — release body text

**Files:** `.github/workflows/release.yml`

**Tasks:**
- [ ] In the `Create GitHub Release` step, replace the `body` field. Before:
  ```yaml
  body: |
    Download the installer for your platform below.

    See the [documentation](https://polyphon.ai/docs/getting-started/) for installation instructions.
  ```
  After:
  ```yaml
  body: |
    Download the macOS (Apple Silicon) installer below.

    See the [documentation](https://polyphon.ai/docs/getting-started/) for installation instructions.
  ```

### P0 (continued): Site Docs

#### 6. Update `site/content/docs/getting-started.md` — download phrasing

**Files:** `site/content/docs/getting-started.md`

**Tasks:**
- [ ] Replace line 20. Before:
  ```
  Download the latest release for your platform from [polyphon.ai](https://polyphon.ai/#download).
  ```
  After:
  ```
  Download the latest release from [polyphon.ai](https://polyphon.ai/#download).
  ```
  Note: the Requirements section already says "macOS 13+ on Apple Silicon (arm64)" and
  the download table already shows only `Polyphon-*-arm64.dmg`. The phrase "for your
  platform" is vestigial; removing it is sufficient.

#### 7. Update `site/content/docs/providers.md` — screenshot comment

**Files:** `site/content/docs/providers.md`

**Tasks:**
- [ ] On the screenshot comment line (not visible to users but inconsistent): Replace
  `Platform: macOS or Linux` → `Platform: macOS` in the HTML comment on line 79.

### P1: Ship If Capacity Allows

Nothing. All P1 items have been promoted to P0.

### Deferred

- **arch lock in `forge.config.ts`** — Makefile `dist` and CI both already pass
  `--arch arm64`; adding `packagerConfig.arch` would create change surface without
  improving the production release path. Decision: do not add for Sprint 014.
- **`drafts/` blog post files** — historical writing artefacts with old macOS/Windows/Linux
  copy; not user-facing; updating them provides no user value.
- **Sprint docs** — `docs/sprints/SPRINT-012.md` describes Linux packaging. Sprint docs are
  append-only records; do not edit.
- **Broader site audit** — the site is mostly already accurate for macOS-only; P1 tasks
  above cover the two concrete remaining items.

---

## Files Summary

| File | Action | Purpose |
|------|---------|---------|
| `README.md` | Modify | Remove Windows/Linux from Installation + Release Pipeline |
| `CLAUDE.md` | Modify | Simplify Code Signing Policy to macOS only |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | Modify | Remove OS dropdown entirely |
| `.github/workflows/release.yml` | Modify | Update release body text |
| `site/content/docs/getting-started.md` | Modify | Remove "for your platform" |
| `site/content/docs/providers.md` | Modify | Fix screenshot comment platform |
| `forge.config.ts` | No change | Already macOS-only; arch lock intentionally not added |
| `package.json` | No change | Generic make script remains; enforcement is in Makefile/CI |

---

## Definition of Done

**README accuracy:**
- [ ] `README.md` says "macOS (Apple Silicon)" in the Download section — no Windows/Linux
- [ ] `README.md` release pipeline steps describe macOS arm64 only — no "six targets"
- [ ] No remaining Windows/Linux references in user-facing README prose

**Developer guidance accuracy:**
- [ ] `CLAUDE.md` Code Signing Policy is macOS-only — Windows and Linux bullets removed
- [ ] Core constraint preserved: the replacement text explicitly names `safeStorage`,
  `Hardened Runtime entitlements`, and `App Sandbox` as prohibited — these are still present
- [ ] Logging section untouched — already accurate

**Issue intake:**
- [ ] `bug_report.yml` OS dropdown field removed entirely

**Release workflow:**
- [ ] `release.yml` release body says "macOS (Apple Silicon)" — not "for your platform"

**Site docs:**
- [ ] `getting-started.md` download sentence updated
- [ ] `providers.md` screenshot comment updated

**Scope:**
- [ ] No files under `src/` modified
- [ ] No schema, IPC, or dependency changes

**Terminology:**
- [ ] All edited user-facing text uses "macOS (Apple Silicon)" as the canonical platform phrase
- [ ] "macOS" alone (without Silicon/arm64) does not appear in download or install contexts

**Verification:**
- [ ] `npm run lint` passes
- [ ] `make test-unit` passes
- [ ] `make test-integration` passes
- [ ] Broader residue grep across active docs returns zero hits:
  ```bash
  grep -rn "Windows\|Linux\|for your platform\|six platform\|six target" \
    README.md CLAUDE.md .github/ISSUE_TEMPLATE/ .github/workflows/release.yml \
    site/content/docs/getting-started.md site/content/docs/providers.md
  ```
- [ ] `python3 -c "import yaml, sys; yaml.safe_load(open('.github/ISSUE_TEMPLATE/bug_report.yml'))"` passes (YAML is valid after dropdown removal)
- [ ] `npm run make -- --arch arm64` produces a DMG in `out/make/` (proves non-change to forge.config.ts is safe and the packaging path remains correct)

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| README wording says "macOS" not "Apple Silicon" — Intel users infer support | Low | Low | Use "macOS (Apple Silicon)" explicitly in download/release-facing text |
| CLAUDE.md edit accidentally removes the core macOS constraint | Very Low | Medium | After-text preserves "unsigned and unnotarized" and the forbidden API list |
| "Other" removal from bug template means edge-case reporters can't self-identify | Very Low | Very Low | Template retains free-text Additional Context field; reporters can self-describe there |

---

## Security Considerations

No new attack surface. All changes are in documentation and CI configuration. The macOS
Code Signing Policy constraint (no signing APIs) is preserved in simplified form — the
constraint is the same, only the irrelevant Windows/Linux sub-bullets are removed.

---

## Observability & Rollback

**Post-ship verification:**
```bash
grep -n "Windows\|Linux\|for your platform\|six platform\|six target" README.md
# → zero hits
grep -n "Windows\|Linux" CLAUDE.md
# → zero hits outside archived sprint docs
cat .github/ISSUE_TEMPLATE/bug_report.yml | grep -A5 "id: os"
# → no match (field removed)
```

**Rollback:** Revert the 4–6 file changes. No schema changes, no npm changes, no runtime
changes. Full revert in one commit.

---

## Documentation

This sprint is itself documentation. No additional CLAUDE.md sections needed.

---

## Dependencies

None. No sprint dependencies. No new packages. No migrations.

---

## Devil's Advocate and Security Critiques Addressed

| Critique | Source | Action |
|---|---|---|
| No canonical terminology standard defined | DA | **Accepted** — Terminology Standard section added; "macOS (Apple Silicon)" is canonical; DoD now requires consistency |
| DoD grep only covers README | DA | **Accepted** — DoD verification grep now covers all six edited files |
| No YAML validation after bug template edit | Security | **Accepted** — DoD now includes `yaml.safe_load()` check |
| `forge.config.ts` non-change not proven safe by DoD | DA | **Accepted** — DoD now includes `npm run make -- --arch arm64` as verification |
| P1 site items inconsistent with Use Case 5 | DA | **Accepted** — site items promoted to P0; all changes now required, not optional |
| CLAUDE.md edit could inadvertently drop specific prohibited API list | Security (Medium) | **Accepted** — DoD requires `safeStorage`, `Hardened Runtime entitlements`, and `App Sandbox` still present in replacement text |
| OS dropdown should be replaced with macOS version field | DA | **Rejected** — user explicitly chose to remove the field entirely; support context is captured in the free-text Additional Context field |
| Add `arch: 'arm64'` to forge.config.ts | DA | **Rejected** — enforcement already exists in Makefile `dist` and CI; see Open Questions |
| "Cosmetic success" risk — historical docs still contain Linux/Windows | DA | **Rejected** — completed sprint docs, security reviews, and similar archives are historical records, not active guidance surfaces; they do not shape Claude's current behavior any more than any other code comment. CLAUDE.md and README are the authoritative guidance layers; this sprint cleans those. |
| Site-wide audit beyond two specific files | DA | **Rejected** — orientation phase confirmed the site is nearly clean; the two P0 tasks cover the concrete remaining residue. A speculative broad audit is out of scope. |

---

## Open Questions

**Should `arch: 'arm64'` be added to `forge.config.ts`?**

Decision: **No** for Sprint 014. Enforcement already exists at the two points that matter:
- `Makefile dist` passes `--arch arm64`
- `.github/workflows/release.yml` passes `--arch arm64` in the build step

Adding a third enforcement point in `packagerConfig` would constrain local developer
flexibility (e.g., a developer who wants `npm run make` to use host arch for quick
iteration) without improving the production release path. Revisit only if a concrete
release-path bug is found.
