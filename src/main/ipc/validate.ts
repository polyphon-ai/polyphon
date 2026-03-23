import { isIPv4, isIPv6 } from 'net';
import type { Message, CompositionVoice, Composition, UserProfile } from '../../shared/types';
import { CONTINUATION_MAX_ROUNDS_LIMIT, AVAILABLE_TOOLS } from '../../shared/constants';

const ALLOWED_TOOL_NAMES = new Set(AVAILABLE_TOOLS.map((t) => t.name));

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CLI_COMMAND_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
// CLI argument allowlist: permits flags (--flag, -f), key=value pairs, paths,
// version strings, model names, etc. Excludes whitespace and shell metacharacters
// (;|&`$(){}><!\n) so argument injection via unexpected flag values is prevented.
// spawn() is always called without shell:true so shell injection is not possible,
// but this pattern still blocks embedding unintended flag boundaries.
export const CLI_ARG_RE = /^[a-zA-Z0-9._/:@=,^%~+\-]+$/;
// Two valid states: empty string (avatar removed) or data:image/...;base64,... produced by
// avatar handlers. Relative paths are not accepted — no handler generates them and widening
// the contract would add complexity for no current benefit.
// SVG is explicitly excluded: SVG files can embed JavaScript (e.g. <svg onload="...">),
// so we allow only raster formats that Electron rasterizes without script execution.
const IMAGE_DATA_URI_RE = /^data:image\/(png|jpeg|gif|webp|avif);base64,[A-Za-z0-9+/=]*$/;

export const MAX_NAME = 200;
export const MAX_SHORT_NAME = 100;
export const MAX_PROVIDER = 50;
export const MAX_MODEL = 200;
const MAX_CLI_COMMAND = 100;
const MAX_DESCRIPTION = 2000;
const MAX_CONTENT = 50000;
export const MAX_CONDUCTOR_CONTEXT = 10000;
export const MAX_AVATAR = 500000;
const MAX_URL = 2000;
const MAX_MESSAGE_CONTENT = 100000;
const MAX_ENV_VAR_NAME = 200;

// Matches POSIX-compliant environment variable names.
export const ENV_VAR_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function requireId(value: unknown, name: string): string {
  if (typeof value === 'string' && UUID_RE.test(value)) return value;
  throw new Error(`Invalid ${name}: must be a valid UUID`);
}

export function requireString(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${name}: must be a string`);
  if (value.length > maxLength) throw new Error(`${name} exceeds maximum length of ${maxLength}`);
  return value;
}

export function requireNonEmptyString(value: unknown, name: string, maxLength: number): string {
  const str = requireString(value, name, maxLength);
  if (str.trim() === '') throw new Error(`${name} is required`);
  return str;
}

export function requireEnum<T extends string>(
  value: unknown,
  name: string,
  allowed: readonly T[],
): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  throw new Error(`Invalid ${name}: must be one of: ${allowed.join(', ')}`);
}

export function coerceBoolean(value: unknown, name: string): boolean {
  if (typeof value === 'boolean') return value;
  // 1 / '1' / 'true' → true
  if (value === 1 || value === '1' || value === 'true') return true;
  // 0 / '0' / 'false' / undefined / null → false (undefined/null are optional archive filters
  // that default to false in the current IPC contract)
  if (value === 0 || value === '0' || value === 'false' || value === undefined || value === null) {
    return false;
  }
  throw new Error(`Invalid ${name}: must be a boolean`);
}

export function requireInteger(
  value: unknown,
  name: string,
  min: number,
  max: number,
): number {
  if (Number.isInteger(value) && (value as number) >= min && (value as number) <= max) {
    return value as number;
  }
  throw new Error(`Invalid ${name}: must be an integer between ${min} and ${max}`);
}

export function requireCliCommand(value: unknown, name: string): string {
  const str = requireNonEmptyString(value, name, MAX_CLI_COMMAND);
  if (!CLI_COMMAND_RE.test(str)) {
    throw new Error(
      `Invalid ${name}: must contain only alphanumeric characters, dots, hyphens, or underscores`,
    );
  }
  return str;
}

export function requireUrl(
  value: unknown,
  name: string,
  allowedProtocols: string[],
): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${name}: must be a string`);
  const protocolLabel = allowedProtocols.map((p) => p.replace(':', '')).join(' or ');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid ${name}: must be a valid ${protocolLabel} URL`);
  }
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(`Invalid ${name}: must be a valid ${protocolLabel} URL`);
  }
  return value;
}

// Returns true for RFC 1918, link-local (169.254.0.0/16, fe80::/10), and .local
// mDNS hostnames. Loopback (127.x / ::1 / localhost) is intentionally NOT blocked
// because custom OpenAI-compatible providers such as Ollama and LM Studio run on
// localhost and are an explicitly supported use case.
function isPrivateNetworkAddress(hostname: string): boolean {
  const h = hostname.toLowerCase();

  if (isIPv4(h)) {
    const [a, b] = h.split('.').map(Number) as [number, number];
    if (a === 10) return true;                          // RFC 1918 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;  // RFC 1918 172.16.0.0/12
    if (a === 192 && b === 168) return true;            // RFC 1918 192.168.0.0/16
    if (a === 169 && b === 254) return true;            // link-local / AWS IMDS
    return false;
  }

  // URL.hostname wraps IPv6 in brackets: "[::1]" — strip them before parsing.
  const ip6 = h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h;
  if (isIPv6(ip6)) {
    if (/^f[cd]/i.test(ip6)) return true;       // ULA fc00::/7
    if (/^fe[89ab]/i.test(ip6)) return true;    // link-local fe80::/10
    return false;
  }

  // .local hostnames are mDNS / LAN targets, not the local machine.
  if (h === 'local' || h.endsWith('.local')) return true;

  return false;
}

// Like requireUrl, but additionally rejects URLs that target private or
// reserved network addresses (RFC 1918, link-local, .local mDNS). Use this
// for any URL that will be used to make outbound HTTP requests on behalf of
// a potentially-untrusted input (e.g. custom provider baseUrl).
export function requireExternalUrl(value: unknown, name: string): string {
  const url = requireUrl(value, name, ['http:', 'https:']);
  const { hostname } = new URL(url);
  if (isPrivateNetworkAddress(hostname)) {
    throw new Error(`Invalid ${name}: must not target a private or reserved network address`);
  }
  return url;
}

export function requireEnvVarName(value: unknown, name: string): string {
  const str = requireNonEmptyString(value, name, MAX_ENV_VAR_NAME);
  if (!ENV_VAR_NAME_RE.test(str)) {
    throw new Error(
      `Invalid ${name}: must be a valid environment variable name (letters, digits, underscores; must start with a letter or underscore)`,
    );
  }
  return str;
}

export function requireArray(value: unknown, name: string): unknown[] {
  if (Array.isArray(value)) return value;
  throw new Error(`Invalid ${name}: must be an array`);
}

export function requireObject(value: unknown, name: string): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error(`Invalid ${name}: must be an object`);
}

export function requireMessageShape(value: unknown): Message {
  const obj = requireObject(value, 'message');
  requireId(obj['id'], 'message.id');
  requireId(obj['sessionId'], 'message.sessionId');
  requireEnum(obj['role'], 'message.role', ['conductor', 'voice', 'system'] as const);
  requireString(obj['content'], 'message.content', MAX_MESSAGE_CONTENT);
  requireInteger(obj['roundIndex'], 'message.roundIndex', -1, 100000);
  requireInteger(obj['timestamp'], 'message.timestamp', 0, Number.MAX_SAFE_INTEGER);
  if (obj['voiceId'] != null) requireNonEmptyString(obj['voiceId'], 'message.voiceId', MAX_SHORT_NAME);
  if (obj['voiceName'] != null) requireNonEmptyString(obj['voiceName'], 'message.voiceName', MAX_SHORT_NAME);
  return value as Message;
}

function requireCompositionVoiceShape(value: unknown, index: number): CompositionVoice {
  const obj = requireObject(value, `voices[${index}]`);
  requireNonEmptyString(obj['provider'], `voices[${index}].provider`, MAX_PROVIDER);
  requireNonEmptyString(obj['displayName'], `voices[${index}].displayName`, MAX_SHORT_NAME);
  requireInteger(obj['order'], `voices[${index}].order`, 0, 1000);
  requireString(obj['color'], `voices[${index}].color`, 30);
  requireString(obj['avatarIcon'], `voices[${index}].avatarIcon`, MAX_SHORT_NAME);
  if (obj['model'] != null) requireNonEmptyString(obj['model'], `voices[${index}].model`, MAX_MODEL);
  if (obj['systemPrompt'] != null) requireString(obj['systemPrompt'], `voices[${index}].systemPrompt`, MAX_CONTENT);
  if (obj['cliCommand'] != null) requireCliCommand(obj['cliCommand'], `voices[${index}].cliCommand`);
  if (obj['cliArgs'] != null) {
    const args = requireArray(obj['cliArgs'], `voices[${index}].cliArgs`);
    args.forEach((arg, i) => {
      const str = requireNonEmptyString(arg, `voices[${index}].cliArgs[${i}]`, MAX_CLI_COMMAND);
      if (!CLI_ARG_RE.test(str)) {
        throw new Error(
          `Invalid voices[${index}].cliArgs[${i}]: CLI arguments must contain only alphanumeric characters, dots, hyphens, underscores, slashes, colons, equals signs, and similar safe characters`,
        );
      }
    });
  }
  if (obj['customProviderId'] != null) requireId(obj['customProviderId'], `voices[${index}].customProviderId`);
  if (obj['systemPromptTemplateId'] != null) requireId(obj['systemPromptTemplateId'], `voices[${index}].systemPromptTemplateId`);
  if (obj['toneOverride'] != null) requireNonEmptyString(obj['toneOverride'], `voices[${index}].toneOverride`, MAX_SHORT_NAME);
  if (obj['enabledTools'] != null) {
    const tools = requireArray(obj['enabledTools'], `voices[${index}].enabledTools`);
    const seen = new Set<string>();
    tools.forEach((tool, ti) => {
      const name = requireNonEmptyString(tool, `voices[${index}].enabledTools[${ti}]`, MAX_SHORT_NAME);
      if (!ALLOWED_TOOL_NAMES.has(name)) {
        throw new Error(`Invalid voices[${index}].enabledTools[${ti}]: unknown tool name "${name}"`);
      }
      if (seen.has(name)) {
        throw new Error(`Invalid voices[${index}].enabledTools[${ti}]: duplicate tool name "${name}"`);
      }
      seen.add(name);
    });
  }
  return value as CompositionVoice;
}

export function requireCompositionData(
  value: unknown,
): Omit<Composition, 'id' | 'createdAt' | 'updatedAt' | 'archived'> {
  const obj = requireObject(value, 'data');
  requireNonEmptyString(obj['name'], 'name', MAX_NAME);
  requireEnum(obj['mode'], 'mode', ['conductor', 'broadcast'] as const);
  requireEnum(obj['continuationPolicy'], 'continuationPolicy', ['none', 'prompt', 'auto'] as const);
  requireInteger(obj['continuationMaxRounds'], 'continuationMaxRounds', 1, CONTINUATION_MAX_ROUNDS_LIMIT);
  const voices = requireArray(obj['voices'], 'voices');
  voices.forEach((v, i) => requireCompositionVoiceShape(v, i));
  return value as Omit<Composition, 'id' | 'createdAt' | 'updatedAt' | 'archived'>;
}

export function requirePartialCompositionData(
  value: unknown,
): Partial<Pick<Composition, 'name' | 'mode' | 'continuationPolicy' | 'continuationMaxRounds'>> {
  const obj = requireObject(value, 'data');
  if (obj['name'] !== undefined) requireNonEmptyString(obj['name'], 'name', MAX_NAME);
  if (obj['mode'] !== undefined) requireEnum(obj['mode'], 'mode', ['conductor', 'broadcast'] as const);
  if (obj['continuationPolicy'] !== undefined) {
    requireEnum(obj['continuationPolicy'], 'continuationPolicy', ['none', 'prompt', 'auto'] as const);
  }
  if (obj['continuationMaxRounds'] !== undefined) {
    requireInteger(obj['continuationMaxRounds'], 'continuationMaxRounds', 1, CONTINUATION_MAX_ROUNDS_LIMIT);
  }
  return value as Partial<Pick<Composition, 'name' | 'mode' | 'continuationPolicy' | 'continuationMaxRounds'>>;
}

export function requireAvatarValue(value: unknown, name: string): string {
  const str = requireString(value, name, MAX_AVATAR);
  if (str === '') return str;
  if (!IMAGE_DATA_URI_RE.test(str)) {
    throw new Error(`${name} must be a valid image data URI or empty string`);
  }
  return str;
}

const MAX_SEARCH_QUERY = 200;

export function requireSearchQuery(value: unknown): string {
  const str = requireString(value, 'query', MAX_SEARCH_QUERY);
  return str.trim();
}

export function requireUserProfileShape(value: unknown): Omit<UserProfile, 'updatedAt'> {
  const obj = requireObject(value, 'profile');
  requireString(obj['conductorName'], 'conductorName', MAX_NAME);
  requireString(obj['pronouns'], 'pronouns', MAX_SHORT_NAME);
  requireString(obj['conductorContext'], 'conductorContext', MAX_CONDUCTOR_CONTEXT);
  requireNonEmptyString(obj['defaultTone'], 'defaultTone', MAX_SHORT_NAME);
  requireString(obj['conductorColor'], 'conductorColor', 30);
  requireAvatarValue(obj['conductorAvatar'], 'conductorAvatar');
  coerceBoolean(obj['preferMarkdown'], 'preferMarkdown');
  return value as Omit<UserProfile, 'updatedAt'>;
}
