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
// PATH additions, etc.). shell-env spawns the user's login shell to capture
// the full environment and makes it available to the main process.
//
// shell-env v4 is ESM-only; dynamic import() lets us load it from the CJS
// main-process bundle without bundling it through Vite.
export async function loadShellEnv(): Promise<void> {
  try {
    const { shellEnv } = await import('shell-env');
    Object.assign(process.env, await shellEnv());
  } catch {
    // Non-fatal: if shell-env fails (e.g. unusual shell config), fall back to
    // whatever environment the OS provided. API key resolution will surface a
    // clear error later if a required key is missing.
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
