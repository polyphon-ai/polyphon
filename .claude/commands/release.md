# /release — Create and push a versioned release

Determine the next semver version based on conventional commits since the last tag,
update `package.json`, commit, tag, and push to trigger the GitHub release workflow.

## Steps

### 1. Check for a clean working tree

Run `git status --porcelain`. If there are unstaged or uncommitted changes, stop and
tell the user to commit or stash them first. Staged changes are also a blocker.

### 2. Find the latest version tag

```bash
git tag -l "v[0-9]*.[0-9]*.[0-9]*" | sort -V | tail -1
```

If no tags exist yet, treat the current version as `v0.0.0` (so the first release
will be `v0.1.0` for a feature or `v0.0.1` for a fix).

### 3. Collect commits since the last tag

```bash
git log <last-tag>..HEAD --pretty=format:"%s"
```

If there are no commits since the last tag, stop and tell the user there is nothing
to release.

### 4. Determine the semver bump

Parse commit subjects using the Conventional Commits rules:

| Condition | Bump |
|---|---|
| Any subject contains `!` after the type (e.g. `feat!:`, `fix!:`) OR any commit body contains `BREAKING CHANGE:` | **major** |
| Any subject starts with `feat:` or `feat(` | **minor** |
| Everything else | **patch** |

Apply the highest-priority bump found across all commits.

### 5. Calculate the new version

Strip the leading `v` from the last tag, parse the three integers, apply the bump
(and reset lower components to 0 for major/minor bumps), then format as `vMAJOR.MINOR.PATCH`.

### 6. Show the plan and confirm

Print a summary like:

```
Last release : v0.3.1
New version  : v0.4.0  (minor bump — new feat commits)

Commits included:
  feat(session): add directed-mode hint
  fix(session): respect @mention routing
  chore(release): ...

Proceed? [y/N]
```

Wait for confirmation before continuing. If the user provides a version override as
`$ARGUMENTS` (e.g. `/release v1.0.0`), skip the calculation above and use that version
instead (still show the plan and confirm).

### 7. Update `package.json` and `site/hugo.yaml`

Use the Edit tool to:

1. Update the `"version"` field in `package.json` to the new version (without the leading `v`).
2. Update the `appVersion` field in `site/hugo.yaml` to the new version (without the leading `v`).

**Do NOT update `downloadVersion` in `site/hugo.yaml`.** That field is updated manually
after the release is confirmed published (artifacts uploaded, release not a draft). Until
then the site shows a "coming soon" fallback so no broken download links are served.

### 8. Commit the version bump

```bash
git add package.json site/hugo.yaml
git commit -m "chore(release): bump version to <new-version>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### 9. Create an annotated tag

```bash
git tag -a <new-version> -m "Release <new-version>"
```

### 10. Push branch and tag

```bash
git push
git push origin <new-version>
```

After pushing, tell the user the tag has been pushed and that the GitHub Actions
release workflow will now build and publish installers for Linux, macOS, and Windows.
Include the expected Actions URL: `https://github.com/polyphon-ai/polyphon/actions`.
