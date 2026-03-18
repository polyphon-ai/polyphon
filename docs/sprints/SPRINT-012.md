# Sprint 012: Linux Sandboxed Packaging — Replace --no-sandbox AppImage Wrapper

## Sprint Theme

**Ship Linux releases where the Chromium renderer sandbox is on by design, not bypassed by
wrapper.**

---

## Overview

Polyphon's Linux packaging currently disables Chromium's renderer sandbox for every user.
`forge.config.ts` contains an `afterComplete` hook that renames the Electron binary to
`polyphon.bin` and replaces it with a shell script that unconditionally passes `--no-sandbox`
at launch. This is CRIT-001 in `docs/security/SECURITY-REVIEW.md` — the highest-severity
finding in the full static review.

Without the renderer sandbox, a compromised renderer process on Linux (via a malicious AI
response if rich content rendering is added, a compromised npm dependency, etc.) has direct
host-system access and an unobstructed path into all IPC operations via the privileged
preload. This affects every Linux user unconditionally — there is no opt-in/opt-out.

The fix: remove the `afterComplete` hook entirely and replace the AppImage output with `.deb`
and `.rpm` packages. These packaging formats support the SUID `chrome-sandbox` binary
natively, which is how Chromium's Linux renderer sandbox is established. This is identical to
how VS Code, Slack, and every other major Electron app ships on Linux. The AppImage format
itself is dropped from the production release path — no unofficial variant, no labeled
workaround.

The sprint scope is narrow: packaging config, CI, Makefile, and documentation. No changes to
`src/`. No schema changes. No IPC changes. No renderer changes.

---

## Use Cases

1. **Debian/Ubuntu user installs via dpkg** — downloads `polyphon_1.x.x_amd64.deb`, runs
   `sudo dpkg -i polyphon_*.deb`, Polyphon launches with the renderer sandbox enabled.
   `chrome-sandbox` has SUID mode (`rwsr-xr-x root root`) as set by the package's postinst
   script.

2. **Fedora/RHEL user installs via rpm** — downloads `polyphon-1.x.x.x86_64.rpm`, runs
   `sudo rpm -i polyphon-*.rpm`, Polyphon launches with the renderer sandbox enabled.

3. **arm64 user installs** — downloads `polyphon_1.x.x_arm64.deb` or `polyphon-1.x.x.aarch64.rpm`
   produced by the `ubuntu-24.04-arm` CI runner.

4. **GitHub Release has all Linux packages** — tagging `v1.x.x` produces `.deb` and `.rpm`
   artifacts for x64 and arm64 and attaches them to the release alongside macOS DMGs and
   Windows EXEs. No `*.AppImage` artifact is published.

5. **Security review finding is closed** — searching the repo and built Linux artifacts for
   `--no-sandbox` returns no production packaging path that injects the flag.

6. **Local builds produce sandboxed packages** — `npm run make` on Linux produces `.deb` and
   `.rpm` in `out/make/`. The `vm-linux-dist` Makefile target builds and fetches `.deb`/`.rpm`
   from the Linux VM; the `dist-linux-arm64` target builds arm64 packages via Docker.

7. **macOS and Windows jobs unaffected** — DMG and Squirrel outputs continue unchanged.

---

## Architecture

```
Current Linux path
  forge.config.ts afterComplete hook
    → renames polyphon to polyphon.bin
    → writes shell script: exec polyphon.bin --no-sandbox "$@"
  MakerAppImage produces AppImage
    → user launches AppImage
    → renderer process has NO sandbox

After this sprint
  forge.config.ts
    → No afterComplete hook
    → MakerDeb produces .deb package
    → MakerRpm produces .rpm package
  User installs .deb or .rpm via package manager
    → postinst script sets chmod 4755 chrome-sandbox
    → polyphon binary is the real Electron binary (not a wrapper)
    → renderer process has Chromium sandbox enabled

CI / release flow (unchanged structure, updated artifacts)
  tag push
    → test + e2e jobs (unchanged)
    → make-linux-x64: out/make/**/*.deb, out/make/**/*.rpm
    → make-linux-arm64: out/make/**/*.deb, out/make/**/*.rpm
    → upload-artifact (deb + rpm per job)
    → release job attaches .deb and .rpm to GitHub Release
```

Key invariant: **no production path in this repo injects `--no-sandbox` as a
fallback.**

**Note on chrome-sandbox SUID wiring:** The SUID mode (`chmod 4755, owned root:root`) is
what allows the `chrome-sandbox` helper to set up Linux namespaces for the renderer process.
`@electron-forge/maker-deb` typically handles this via a postinst script automatically — but
this must be verified at build time, not assumed. DoD requires confirming the SUID bit is
set on a real installed package. If the maker does not handle it automatically, an explicit
`maintainerScripts.postinst` entry must be added to the MakerDeb config.

---

## Implementation Plan

### P0: Must Ship

#### 1. Add new maker packages to `package.json`

**Files:** `package.json`

**Tasks:**
- [ ] Add `"@electron-forge/maker-deb": "^7.11.1"` to `devDependencies`
- [ ] Add `"@electron-forge/maker-rpm": "^7.11.1"` to `devDependencies`
- [ ] Remove `"@reforged/maker-appimage"` from `devDependencies`
- [ ] Run `npm install` to update `package-lock.json`

#### 2. Update `forge.config.ts` — remove hook, replace AppImage with deb/rpm makers

**Files:** `forge.config.ts`

**Tasks:**
- [ ] Remove the entire `afterComplete` array (lines 19-33) from `packagerConfig`
- [ ] Remove the `packagerConfig.afterComplete` key entirely (leave no empty array)
- [ ] Remove the `import { renameSync, writeFileSync, chmodSync } from 'fs'` line (unused
  after hook removal)
- [ ] Remove the `import { join } from 'path'` line if it is only used by the hook
- [ ] Remove `import { MakerAppImage } from '@reforged/maker-appimage'`
- [ ] Remove `new MakerAppImage({})` from the `makers` array
- [ ] Add `import { MakerDeb } from '@electron-forge/maker-deb'`
- [ ] Add `import { MakerRpm } from '@electron-forge/maker-rpm'`
- [ ] Add to the `makers` array (provisional config — verify at build time):
  ```ts
  new MakerDeb({
    options: {
      maintainer: 'Polyphon AI',
      homepage: 'https://polyphon.ai',
      icon: 'assets/icons/icon.png',
    },
  }, ['linux']),
  new MakerRpm({
    options: {
      license: 'Proprietary',
      homepage: 'https://polyphon.ai',
      icon: 'assets/icons/icon.png',
    },
  }, ['linux']),
  ```
- [ ] Verify `assets/icons/icon.png` exists (the `.png` extension is required by deb/rpm
  makers; if absent, use the correct path to the PNG icon)
- [ ] Verify `npm run lint` passes (TypeScript type-check on updated imports)

**chrome-sandbox SUID wiring — implementation question, not assumption:**

The SUID mode is the security-critical outcome. It may or may not be set automatically by
the makers. This must be verified empirically, not assumed.

**Debian (.deb):** After building and installing, run:
```bash
stat -c %a /usr/lib/polyphon/chrome-sandbox
```
Must output `4755`. If NOT, add a `postinst` script to the MakerDeb config:
```ts
scripts: { postinst: './packaging/deb-postinst.sh' }
```
with `packaging/deb-postinst.sh`:
```bash
#!/bin/sh
chmod 4755 /usr/lib/polyphon/chrome-sandbox || true
```

**RPM (.rpm):** After building and installing, run:
```bash
stat -c %a /usr/lib/polyphon/chrome-sandbox
```
Must output `4755`. If NOT, add a `%post` scriptlet to the MakerRpm config:
```ts
options: { scripts: { post: './packaging/rpm-post.sh' } }
```
with `packaging/rpm-post.sh`:
```bash
#!/bin/sh
chmod 4755 /usr/lib/polyphon/chrome-sandbox || true
```

Both fallback scripts (`packaging/deb-postinst.sh`, `packaging/rpm-post.sh`) should be
created if needed — they are the explicit safety net for this sprint. Do not skip the
real-install verification step.

#### 3. Update `.github/workflows/release.yml`

**Files:** `.github/workflows/release.yml`

**Tasks:**
- [ ] In `make-linux-x64` job:
  - Update step name from "Build Linux x64 AppImage" to "Build Linux x64 packages"
  - Change artifact upload path from `out/make/**/*.AppImage` to:
    ```yaml
    path: |
      out/make/**/*.deb
      out/make/**/*.rpm
    ```
  - Keep `if-no-files-found: error`
  - Verify `rpm` is in the `apt-get install` list (it is already present; rpmbuild needed
    for rpm maker)
- [ ] In `make-linux-arm64` job:
  - Same name and artifact path updates as x64
  - Verify `rpm` is in `apt-get install` on the arm64 runner
- [ ] In `release` job:
  - Update the `files` field to replace `dist/linux/**/*.AppImage` with:
    ```yaml
    files: |
      dist/linux/**/*.deb
      dist/linux/**/*.rpm
      dist/macos/**/*.dmg
      dist/windows/**/*.exe
    ```
- [ ] Verify no remaining `*.AppImage` glob anywhere in the file

#### 4. Update `Makefile`

**Files:** `Makefile`

**Tasks:**
- [ ] `dist-linux-arm64` target (line 81):
  - Update help comment from "Build Linux arm64 AppImage via Docker" to
    "Build Linux arm64 packages (.deb/.rpm) via Docker"
  - Remove `squashfs-tools` from the Docker `apt-get install` command (AppImage dependency)
  - Remove `APPIMAGE_EXTRACT_AND_RUN=1` env var from the Docker `docker run` command
    (AppImage-specific env var)
  - Verify the Docker image (`node:22-bookworm`) has dpkg-deb and rpmbuild available;
    if rpmbuild is absent, add `rpm` to the Docker apt-get install command
- [ ] `vm-linux-dist` target (line 278):
  - Update help comment from "Build Linux x64 + arm64 AppImages on the Linux VM" to
    "Build Linux x64 + arm64 packages (.deb/.rpm) on the Linux VM; fetch to out/dist/linux/"
  - Update echo messages: "Building Linux x64 AppImage" → "Building Linux x64 packages"
    and "Building Linux arm64 AppImage" → "Building Linux arm64 packages"
  - Change `npm install` to `npm ci` (fixes LOW-007 from security review; easy while
    already editing this target)
  - No other changes to the VM target

#### 5. Update documentation

**Files:** `docs/security/SECURITY-REVIEW.md`, `README.md`

**Tasks:**
- [ ] Add a line to CRIT-001 in `docs/security/SECURITY-REVIEW.md` noting it is resolved
  by Sprint 012: e.g., `**Resolved in Sprint 012:** afterComplete wrapper removed; .deb and
  .rpm packaging with SUID chrome-sandbox replaces AppImage.`
- [ ] Scan `README.md` for any AppImage references or Linux download instructions that
  need updating (expected to be minimal — README currently says "Pre-built installers for
  macOS, Windows, and Linux are available on the Releases page" with no format-specific
  mention)

#### 6. Verification pass on real Linux installs

This is a delivery requirement, not a code change. Both `.deb` and `.rpm` must be verified
on real installed environments — build success alone does not prove CRIT-001 is closed.

**Tasks:**
- [ ] Build Linux x64: `npm run make -- --arch x64` → confirm `*.deb` and `*.rpm` produced
  in `out/make/`
- [ ] Build Linux arm64: confirm `*.deb` and `*.rpm` produced
- [ ] Inspect `.deb` contents: `dpkg-deb -c polyphon_*.deb` — confirm chrome-sandbox binary
  is present
- [ ] Inspect `.rpm` contents: `rpm -qplv polyphon-*.rpm` — confirm chrome-sandbox binary
  is present
- [ ] Confirm the production binary in the package is an ELF binary, not a shell script:
  inspect via `dpkg-deb` or `rpm` that the packaged `polyphon` binary is ELF
- [ ] Install `.deb` on a Debian/Ubuntu environment (x64): `sudo dpkg -i polyphon_*.deb`
- [ ] Confirm SUID mode (numeric, not visual):
  `stat -c %a <install-path>/chrome-sandbox` must output `4755`
  (the install path is typically `/usr/lib/polyphon/chrome-sandbox` but verify from the
  package manifest, not assumption)
- [ ] Launch Polyphon and confirm renderer sandbox is ACTIVE:
  - Check Electron launch log: MUST NOT contain "Running without the SUID sandbox"
  - Stronger check: `cat /proc/$(pgrep -f 'polyphon.*render')/status | grep Seccomp`
    should show `Seccomp: 2` (SECCOMP_MODE_FILTER active in renderer)
- [ ] Repo-wide grep for `--no-sandbox` in build-relevant paths confirms none remain:
  ```
  grep -r '\-\-no-sandbox' \
    --include='*.ts' --include='*.js' --include='*.yml' --include='*.yaml' \
    --include='Makefile' .
  ```
  Should return no hits for production packaging paths (test helpers may be exempt with
  justification)
- [ ] Install `.rpm` on a Fedora/RHEL-compatible environment and repeat all checks above:
  SUID stat, launch log, Seccomp status

### P1: Ship If Capacity Allows

#### Flatpak as an additional sandboxed Linux target

Flatpak is sandbox-native (handles renderer sandboxing via Flatpak runtime, no SUID
needed) and distro-agnostic. Adding it alongside `.deb`/`.rpm` is additive and should not
block the P0 fix. Defer if it adds unexpected CI complexity.

**Files:** `forge.config.ts`, `package.json`, `.github/workflows/release.yml`

**Tasks:**
- [ ] Verify `@electron-forge/maker-flatpak` latest version:
  `npm view @electron-forge/maker-flatpak version` (confirmed `7.11.1` at planning time)
- [ ] Add `"@electron-forge/maker-flatpak": "^7.11.1"` to `devDependencies`
- [ ] Add `import { MakerFlatpak } from '@electron-forge/maker-flatpak'` to `forge.config.ts`
- [ ] Add `new MakerFlatpak({ options: { id: 'ai.polyphon.Polyphon' } }, ['linux'])` to
  makers array
- [ ] Add Flatpak CI job(s) or extend Linux jobs to produce `.flatpak` artifacts
- [ ] Attach `.flatpak` artifacts to GitHub Release
- [ ] Flatpak must be strictly additive — if it causes errors, cut it rather than blocking
  the `.deb`/`.rpm` P0

### Deferred

- **AppImage (any form)** — dropped from production release path. No unofficial variant,
  no labeled workaround. Clean break.
- **Flathub submission and storefront polish** — valuable long-term; separate from this sprint.
- **Linux auto-update metadata** — no in-app Linux updater in current app; out of scope.
- **Code signing (.deb/.rpm GPG)** — desirable long-term; not needed for direct GitHub
  Release download.

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Modify | Add maker-deb, maker-rpm; remove maker-appimage |
| `forge.config.ts` | Modify | Remove afterComplete hook + AppImage maker; add MakerDeb + MakerRpm |
| `.github/workflows/release.yml` | Modify | Update artifact paths/globs from AppImage to deb+rpm |
| `Makefile` | Modify | Update dist-linux-arm64 and vm-linux-dist from AppImage to deb/rpm terminology |
| `README.md` | Inspect + minor update if needed | Verify no AppImage-specific install instructions remain |
| `docs/security/SECURITY-REVIEW.md` | Modify | Mark CRIT-001 resolved |
| `packaging/deb-postinst.sh` | Create if needed | Debian SUID postinst script (if maker-deb doesn't set 4755 automatically) |
| `packaging/rpm-post.sh` | Create if needed | RPM SUID %post script (if maker-rpm doesn't set 4755 automatically) |

---

## Definition of Done

**forge.config.ts:**
- [ ] `afterComplete` hook is completely absent — no reference to `--no-sandbox` wrapper
- [ ] `MakerAppImage` import and instance are removed
- [ ] `@reforged/maker-appimage` is not referenced anywhere in the file
- [ ] `MakerDeb` and `MakerRpm` are imported and configured in the `makers` array
- [ ] Dead `fs` imports (`renameSync`, `writeFileSync`, `chmodSync`) removed
- [ ] `npm run lint` passes (TypeScript type-check)

**package.json:**
- [ ] `@electron-forge/maker-deb ^7.11.1` in `devDependencies`
- [ ] `@electron-forge/maker-rpm ^7.11.1` in `devDependencies`
- [ ] `@reforged/maker-appimage` absent from `devDependencies`
- [ ] `package-lock.json` updated

**CI workflow:**
- [ ] `make-linux-x64` uploads `*.deb` and `*.rpm` artifacts
- [ ] `make-linux-arm64` uploads `*.deb` and `*.rpm` artifacts
- [ ] `release` job attaches `*.deb` and `*.rpm` to GitHub Release
- [ ] No `*.AppImage` glob remains in `release.yml`

**Makefile:**
- [ ] `dist-linux-arm64` help text and Docker command updated (no squashfs-tools,
  no APPIMAGE_EXTRACT_AND_RUN)
- [ ] `vm-linux-dist` description and echo messages reference native packages, not AppImages

**Sandbox correctness (verified on real installed packages — build success is not sufficient):**
- [ ] Packaged `polyphon` binary is ELF (not a shell script) — confirmed via package inspection
- [ ] `stat -c %a <install-path>/chrome-sandbox` → outputs `4755` on installed `.deb`
- [ ] `stat -c %a <install-path>/chrome-sandbox` → outputs `4755` on installed `.rpm`
  (RPM path verified from package manifest, not assumed)
- [ ] Electron launch log does NOT contain "Running without the SUID sandbox" on Debian/Ubuntu
- [ ] `Seccomp: 2` in renderer process `/proc/<pid>/status` on Debian/Ubuntu
- [ ] Electron launch log does NOT contain "Running without the SUID sandbox" on Fedora/RHEL
- [ ] Repo-wide `--no-sandbox` grep returns no production packaging hits:
  `grep -r '\-\-no-sandbox' --include='*.ts' --include='*.yml' --include='*.yaml' --include='Makefile' .`

**Tests:**
- [ ] `npm run lint` passes
- [ ] `make test-unit` passes (no runtime code changes; confirms no regressions)
- [ ] `make test-integration` passes
- [ ] E2E tests pass on Linux (format-agnostic; tests run against built app dir)

**Documentation:**
- [ ] CRIT-001 in SECURITY-REVIEW.md notes it is resolved by Sprint 012
- [ ] README.md contains no AppImage-specific install instructions

**Non-regression:**
- [ ] macOS DMG CI jobs unchanged and passing
- [ ] Windows Squirrel CI jobs unchanged and passing
- [ ] No runtime code in `src/` changed

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `maker-deb` does NOT set chrome-sandbox SUID automatically; sandbox not active post-install | Medium | Critical | DoD requires real-install SUID verification; postinst script path documented in P0 Task 2 |
| `rpmbuild` unavailable on CI arm64 runner | Low | Medium | `rpm` apt package already in CI apt-get install; rpmbuild is included |
| arm64 rpm build fails on `ubuntu-24.04-arm` | Low | Medium | arm64 is native on that runner; no cross-compilation needed |
| Users with AppImage installs can no longer auto-find download | Medium | Low | Release note explains format change; only pre-release users affected |
| `.flatpak` CI integration adds unexpected complexity (P1) | Medium | Low | P1 is additive; drop it rather than blocking P0 deb/rpm fix |
| `icon.png` path wrong in maker config | Low | Low | Verify path before shipping; it is a packaging-time metadata check |

---

## Security Considerations

- **CRIT-001 closure**: removing the `--no-sandbox` wrapper is the direct fix. `.deb`/`.rpm`
  + SUID `chrome-sandbox` restores the full Chromium renderer namespace/seccomp sandbox.
- **No new attack surface**: all changes are in packaging config and CI. No new runtime code
  paths, IPC channels, subprocess spawning, or network calls.
- **SUID chrome-sandbox**: `chmod 4755, owned root:root` is the exact mechanism used by all
  major Electron apps on Linux (VS Code, Slack, Discord, etc.). It is minimal in scope — it
  only sets up namespace/seccomp isolation for the renderer subprocess.
- **No silent fallback**: the plan explicitly prohibits any runtime code path that silently
  reintroduces `--no-sandbox`. The entire `afterComplete` hook is removed, not gated.
- **Package provenance**: packages are built in the same CI environment as before. No new
  external build infrastructure.

---

## Observability & Rollback

**Post-ship verification:**
1. `grep -r '\-\-no-sandbox' forge.config.ts` → no output
2. Download `.deb` from GitHub Release; `sudo dpkg -i` on Debian/Ubuntu
3. `ls -la /usr/lib/polyphon/chrome-sandbox` → confirm SUID bit
4. Launch Polyphon; confirm no "Running without the SUID sandbox" in Electron log
5. Optional: `file /usr/lib/polyphon/polyphon` → must show ELF, not shell script

**Rollback:**
Revert `forge.config.ts`, `package.json`, `package-lock.json`, and `release.yml`. No
schema changes, no migrations, no persisted data format changes — full revert in one commit.

**IMPORTANT**: rollback restores CRIT-001 — the `--no-sandbox` wrapper will be active again
for all Linux users. Rollback should be treated as an emergency-only decision and addressed
as a release blocker before any Linux packages are distributed.

---

## Documentation

- [ ] Add CRIT-001 resolution note to `docs/security/SECURITY-REVIEW.md`
- [ ] No `CLAUDE.md` update needed — packaging is not covered by the coding conventions

---

## Dependencies

- `@electron-forge/maker-deb ^7.11.1` (new dependency — confirmed latest at planning time)
- `@electron-forge/maker-rpm ^7.11.1` (new dependency — confirmed latest at planning time)
- `@reforged/maker-appimage` removed
- No sprint dependencies

---

## Open Questions

1. **Does `@electron-forge/maker-deb` set `chmod 4755` on `chrome-sandbox` automatically?**
   Implementation-time question. If yes, no postinst script needed. If no, use the fallback
   script documented in P0 Task 2. DoD requires real-install verification regardless.

2. **Does `@electron-forge/maker-rpm` set the SUID bit automatically?**
   Same question for RPM. The RPM fallback path is documented in P0 Task 2.

3. **Does `node:22-bookworm` in the `dist-linux-arm64` Docker command have `rpmbuild`?**
   Bookworm (Debian 12) does not include rpmbuild by default. If absent, add `rpm` to the
   Docker apt-get install in the Makefile target.

---

## Devil's Advocate and Security Critiques Addressed

| Critique | Source | Action |
|---|---|---|
| chrome-sandbox SUID too confident; "maker typically handles it" is speculative | DA + Security | **Accepted** — P0 Task 2 now documents explicit fallback postinst/post scripts for both deb and rpm; DoD requires `stat -c %a` numeric verification on both; Open Questions section added |
| RPM fallback path not documented alongside deb | DA | **Accepted** — P0 Task 2 now shows explicit RPM `%post` fallback path |
| "No --no-sandbox" ≠ "sandbox active"; DoD verification too weak | DA + Security | **Accepted** — DoD now requires `Seccomp: 2` in renderer `/proc/<pid>/status` and Electron launch log check; verification also uses `stat -c %a` (numeric) not `ls -la` (visual) |
| `--no-sandbox` grep covers only forge.config.ts | Security | **Accepted** — Task 6 and DoD now use a repo-wide grep covering `.ts`, `.yml`, `.yaml`, Makefile |
| "Open Questions: None" is unserious given unresolved SUID behavior | DA | **Accepted** — three open questions added; all are implementation-time decisions with documented fallback paths |
| site/ download surfaces may reference AppImage | DA | **Investigated** — `grep -r appimage site/` returns no results; no site update needed |
| Makefile Docker target (`dist-linux-arm64`) may lack rpmbuild | DA | **Accepted** — added explicit task to verify `rpmbuild` availability and add `rpm` to Docker apt install if absent |
| `npm install` → `npm ci` in Makefile vm-linux-dist | Security (LOW-007) | **Accepted** — added to P0 Task 4 while editing the target; low-effort fix in scope |
| Rollback "one commit" ignores published artifacts | DA | **Partially accepted** — rollback section now explicitly notes it restores CRIT-001 and should be emergency-only; full operational rollback for published packages is out of scope for a pre-release product |
| P1 Flatpak isn't "harmlessly additive" — adds verification load | DA | **Acknowledged** — P1 section already says "cut it rather than blocking P0"; no change needed; user confirmed Flatpak as P1 in interview |
| No runtime assertion that sandbox is active in the app | DA | **Rejected** — runtime sandbox detection code is out of scope and over-engineering; the correct fix is verified packaging; OS + packaging handle sandbox establishment |
| "Borrowed confidence from VS Code and Slack" is not architectural evidence | DA | **Acknowledged** — the analogy is illustrative, not an architectural argument; the actual evidence is the `@electron-forge/maker-deb` maker API and the SUID mechanism itself |
| Package upgrade/uninstall behavior not in DoD | DA | **Rejected** — pre-release product; no existing Linux user base with installed packages; upgrade testing is out of scope |
| Non-root install guidance not in DoD | DA | **Rejected** — Linux `.deb`/`.rpm` packages require root install; that is standard; no new guidance needed |
| Flatpak finish-args may be too permissive | Security | **Accepted for P1** — if Flatpak P1 is implemented, DoD for P1 must include `finish-args` review and Chromium sandbox confirmation |
| Pin `softprops/action-gh-release` to commit SHA (MED-005) | Security | **Acknowledged, out of scope** — MED-005 is a separate finding; bundling it here would expand scope; track as a standalone sprint or future task |
