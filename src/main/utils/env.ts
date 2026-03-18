import { spawnSync } from 'node:child_process';
import type { ApiKeyStatus } from '../../shared/types';

// Normalizes a provider name to the env-var prefix convention.
// "anthropic" → "ANTHROPIC", "claude-code" → "CLAUDE_CODE"
function toEnvPrefix(provider: string): string {
  return provider.toUpperCase().replace(/-/g, '_');
}

// Masks an API key: first 3 chars + "..." + last 3 chars.
// Returns "..." for keys shorter than 7 characters.
export function maskApiKey(key: string): string {
  if (key.length < 7) return '...';
  return `${key.slice(0, 3)}...${key.slice(-3)}`;
}

export const SHELL_ENV_MAX_LEN = 512 * 1024; // JS string .length units (UTF-16 code units, ≈ bytes for ASCII)
export const ENV_VALUE_MAX_BYTES = 8 * 1024; // same units
export const ENV_KEY_RE = /^[A-Z0-9_]+$/;

// Applies a list of pre-split "KEY=VALUE" entries to process.env, applying
// the same key/value filters as parseEnvBlock.
function applyEnvEntries(entries: string[]): void {
  for (const entry of entries) {
    const eq = entry.indexOf('=');
    if (eq <= 0) continue;
    const key = entry.slice(0, eq);
    const value = entry.slice(eq + 1);
    if (!ENV_KEY_RE.test(key)) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[loadShellEnv] skipping env var with non-standard name: ${key}`);
      }
      continue;
    }
    if (value.length > ENV_VALUE_MAX_BYTES) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[loadShellEnv] skipping env var with oversized value: ${key}`);
      }
      continue;
    }
    process.env[key] = value;
  }
}

// Parses a newline-delimited env block (legacy delimiter-based capture) and
// merges matching variables into process.env. Returns false if the block
// exceeds the size cap, true otherwise.
//
// Filters applied:
//   - Block size: > SHELL_ENV_MAX_LEN chars → return false
//   - Key name: must match ENV_KEY_RE ([A-Z0-9_]+) — lowercase and dotted
//     names are intentionally excluded (policy decision, not a bug)
//   - Value length: > ENV_VALUE_MAX_BYTES chars → entry skipped
export function parseEnvBlock(block: string): boolean {
  if (block.length > SHELL_ENV_MAX_LEN) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[loadShellEnv] env block exceeds size cap; skipping shell env merge — ' +
          'API keys from shell config will not be available from this shell',
      );
    }
    return false;
  }
  applyEnvEntries(block.split('\n'));
  return true;
}

// Parses a NUL-terminated env block produced by `env -0` and merges matching
// variables into process.env. NUL bytes cannot appear in POSIX env var values,
// so splitting on \0 is unambiguous and immune to delimiter-collision attacks.
// Returns false if the block exceeds the size cap, true otherwise.
export function parseNulEnvBlock(block: string): boolean {
  if (block.length > SHELL_ENV_MAX_LEN) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[loadShellEnv] env block exceeds size cap; skipping shell env merge — ' +
          'API keys from shell config will not be available from this shell',
      );
    }
    return false;
  }
  applyEnvEntries(block.split('\0').filter(Boolean));
  return true;
}

// Merges shell-exported environment variables into process.env.
//
// GUI apps launched from the Dock, Spotlight, or an app launcher inherit a
// minimal environment that often lacks shell-exported variables (API keys,
// PATH additions, etc.). We spawn the user's login shell to capture the full
// environment and apply it to the main process before any voice is created.
//
// The shell is invoked with -ilc: -i makes it interactive (loads aliases and
// functions), -l makes it a login shell (sources ~/.zshrc, ~/.bash_profile,
// etc. so API keys and PATH additions are available), and -c runs the capture
// command and exits. Security implication: the user's shell init files execute
// inside Polyphon's process space during this call. This is intentional and
// acceptable for a local-first desktop app — a user who controls ~/.zshrc
// already has the ability to run arbitrary code as themselves; running their
// own init files in Polyphon's process space grants no additional privilege.
//
// The Windows early-return exists because there is no POSIX login-shell
// convention on Windows: -ilc semantics do not apply to cmd.exe or PowerShell,
// and environment propagation works differently on that platform.
//
// Uses child_process.spawnSync so this is bundled directly into main.js and
// works correctly in the packaged ASAR app (no external ESM dependency needed).
export function loadShellEnv(): void {
  if (process.platform === 'win32') return;

  // `env -0` outputs NUL-terminated entries: immune to delimiter-collision
  // attacks where an env var value happens to contain the delimiter string.
  const cmd = `command env -0; exit`;
  const args = ['-ilc', cmd];
  // Suppress shell plugin side-effects (e.g. oh-my-zsh auto-update, tmux).
  const spawnEnv = {
    DISABLE_AUTO_UPDATE: 'true',
    ZSH_TMUX_AUTOSTARTED: 'true',
    ZSH_TMUX_AUTOSTART: 'false',
  };

  // Try the user's preferred shell first, then fall back to common login shells.
  const candidates = [process.env.SHELL, '/bin/zsh', '/bin/bash'].filter(
    Boolean,
  ) as string[];
  const seen = new Set<string>();

  for (const shell of candidates) {
    if (seen.has(shell)) continue;
    seen.add(shell);

    const result = spawnSync(shell, args, {
      env: spawnEnv,
      // Use 'buffer' encoding so NUL bytes from `env -0` are preserved intact.
      encoding: 'buffer',
      timeout: 5000,
    });

    if (result.status !== 0 || !result.stdout) continue;

    // Decode as latin1 (binary-safe) so NUL bytes pass through as '\0'.
    const block = (result.stdout as unknown as Buffer).toString('latin1');
    if (!parseNulEnvBlock(block)) continue;
    return;
  }
}

// Resolves an API key for the given provider using the fallback chain:
//   POLYPHON_{PROVIDER}_API_KEY → {PROVIDER}_API_KEY → throw
//
// Call loadShellEnv() at startup before any voice is created so that
// shell-exported keys are available regardless of how the app was launched.
//
// Throws an Error whose .message can be forwarded to the renderer to show
// a "set your API key" prompt.
export function resolveApiKey(provider: string): string {
  const prefix = toEnvPrefix(provider);
  const polyphonKey = `POLYPHON_${prefix}_API_KEY`;
  const providerKey = `${prefix}_API_KEY`;

  const value =
    process.env[polyphonKey]?.trim() || process.env[providerKey]?.trim();

  if (value) return value;

  throw new Error(
    `No API key found for provider "${provider}". ` +
      `Set ${polyphonKey} (Polyphon-specific) or ${providerKey} (shared) ` +
      `in your shell environment and restart the app.`,
  );
}

// Returns the API key resolution status for a provider without throwing.
// The returned maskedKey is safe to send over IPC to the renderer.
export function resolveApiKeyStatus(provider: string): ApiKeyStatus {
  const prefix = toEnvPrefix(provider);
  const polyphonKey = `POLYPHON_${prefix}_API_KEY`;
  const providerKey = `${prefix}_API_KEY`;

  const specificValue = process.env[polyphonKey]?.trim();
  if (specificValue) {
    return { status: 'specific', varName: polyphonKey, maskedKey: maskApiKey(specificValue) };
  }

  const fallbackValue = process.env[providerKey]?.trim();
  if (fallbackValue) {
    return { status: 'fallback', varName: providerKey, maskedKey: maskApiKey(fallbackValue) };
  }

  return { status: 'none', specificVar: polyphonKey, fallbackVar: providerKey };
}
