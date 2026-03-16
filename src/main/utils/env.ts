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

// Merges shell-exported environment variables into process.env.
//
// GUI apps launched from the Dock, Spotlight, or an app launcher inherit a
// minimal environment that often lacks shell-exported variables (API keys,
// PATH additions, etc.). We spawn the user's login shell to capture the full
// environment and apply it to the main process before any voice is created.
//
// Uses child_process.spawnSync so this is bundled directly into main.js and
// works correctly in the packaged ASAR app (no external ESM dependency needed).
export function loadShellEnv(): void {
  if (process.platform === 'win32') return;

  const DELIM = '_POLYPHON_ENV_DELIM_';
  const cmd = `echo -n "${DELIM}"; command env; echo -n "${DELIM}"; exit`;
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
      encoding: 'utf8',
      timeout: 5000,
    });

    if (result.status !== 0 || !result.stdout) continue;

    const parts = result.stdout.split(DELIM);
    if (parts.length < 2) continue;

    for (const line of parts[1].split('\n')) {
      const eq = line.indexOf('=');
      if (eq > 0) {
        process.env[line.slice(0, eq)] = line.slice(eq + 1);
      }
    }
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
