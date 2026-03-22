import path from 'node:path';
import fs from 'node:fs';

import { app } from 'electron';
import log from 'electron-log/main';

// Keys whose values must never appear in logs (credentials, PII, key material)
export const SENSITIVE_LOG_KEYS: ReadonlySet<string> = new Set([
  // DB key material
  'keyHex', 'dbKey', 'wrappedKey', 'wrappingKey',
  // Conductor profile PII
  'conductor_name', 'conductorName',
  'pronouns',
  'conductor_context', 'conductorContext',
  'conductor_avatar', 'conductorAvatar',
  // Encrypted DB columns
  'content', 'metadata', 'description',
  'system_prompt', 'systemPrompt',
  'cli_command', 'cliCommand',
  'cli_args', 'cliArgs',
  'base_url', 'baseUrl',
  'working_dir', 'workingDir',
  // API credentials
  'apiKey', 'api_key', 'authorization', 'Authorization', 'x-api-key', 'x-goog-api-key',
]);

const API_KEY_RE = /sk-\S+|sk-ant-\S+|AIza\S+|gsk_\S+|GOOG\S+|ghp_\S+|github_pat_\S+|Bearer\s+\S+/g;

function sanitizeString(s: string): string {
  return s.replace(API_KEY_RE, '[REDACTED]');
}

export function sanitizeValue(value: unknown, visited?: WeakSet<object>, depth?: number): unknown {
  const d = depth ?? 0;
  const v = visited ?? new WeakSet<object>();
  try {
    if (d >= 6) return '[DEPTH LIMIT]';
    if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') return sanitizeString(value);
    if (value instanceof Error) {
      const result: Record<string, unknown> = {
        name: value.name,
        message: sanitizeString(value.message),
      };
      if (isDebugEnabled() && value.stack) {
        result.stack = sanitizeString(value.stack);
      }
      return result;
    }
    if (Buffer.isBuffer(value)) return `[BUFFER length=${(value as Buffer).length}]`;
    if (value instanceof Map) return `[Map size=${(value as Map<unknown, unknown>).size}]`;
    if (value instanceof Set) return `[Set size=${(value as Set<unknown>).size}]`;
    if (value instanceof Date) return (value as Date).toISOString();
    if (Array.isArray(value)) {
      return value.map((el) => sanitizeValue(el, v, d + 1));
    }
    if (typeof value === 'object') {
      const proto = Object.getPrototypeOf(value);
      if (proto === Object.prototype || proto === null) {
        if (v.has(value)) return '[Circular]';
        v.add(value);
        const result: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
          result[key] = SENSITIVE_LOG_KEYS.has(key) ? '[REDACTED]' : sanitizeValue(val, v, d + 1);
        }
        return result;
      }
      // Class instance not handled above
      return `[${(value as object).constructor?.name ?? 'Object'}]`;
    }
    return value;
  } catch {
    return '[sanitize error]';
  }
}

export function sanitizeLogArgs(args: unknown[]): unknown[] {
  return args.map((a) => sanitizeValue(a));
}

// Guard against re-initialization when Vitest re-evaluates this module.
// electron-log's instance is a process-level singleton; globalThis persists
// across module re-evaluations within the same Vitest worker.
const _g = globalThis as Record<symbol, boolean>;
const _MAIN_INIT = Symbol.for('polyphon.log.main.initialized');

if (!_g[_MAIN_INIT]) {
  _g[_MAIN_INIT] = true;
  log.initialize();
}
log.transports.file.level = process.env.POLYPHON_DEBUG === '1' ? 'debug' : 'info';
log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs', 'polyphon.log');
log.transports.file.maxSize = 25 * 1024 * 1024; // 25 MB per file
log.transports.file.archiveLogFn = (oldLogFile) => {
  const oldPath = oldLogFile.path;
  const dir = path.dirname(oldPath);
  const ext = path.extname(oldPath);
  const base = path.basename(oldPath, ext);
  const maxArchives = 4; // 4 archives + 1 active = 5 total
  for (let i = maxArchives; i >= 1; i--) {
    const src = path.join(dir, `${base}.${i}${ext}`);
    if (fs.existsSync(src)) {
      if (i === maxArchives) {
        fs.rmSync(src, { force: true });
      } else {
        fs.renameSync(src, path.join(dir, `${base}.${i + 1}${ext}`));
      }
    }
  }
  fs.renameSync(oldPath, path.join(dir, `${base}.1${ext}`));
};
log.transports.console.level = process.env.NODE_ENV !== 'production' ? 'debug' : false;

function debugFlagPath(): string {
  return path.join(app.getPath('userData'), 'debug.flag');
}

export function isDebugEnabled(): boolean {
  return log.transports.file.level === 'debug';
}

export function setDebugEnabled(enabled: boolean): void {
  log.transports.file.level = enabled ? 'debug' : 'info';
}

export function writeDebugFlag(enabled: boolean): void {
  try {
    const flagPath = debugFlagPath();
    if (enabled) {
      fs.writeFileSync(flagPath, '', { mode: 0o600 });
    } else {
      fs.rmSync(flagPath, { force: true });
    }
  } catch {
    // non-fatal
  }
}

export function initDebugFromFlag(): void {
  if (isDebugEnabled()) return; // already on via POLYPHON_DEBUG=1
  try {
    if (fs.existsSync(debugFlagPath())) {
      setDebugEnabled(true);
    }
  } catch {
    // non-fatal
  }
}

export const logger = {
  error: (...args: unknown[]) => { try { log.error(...sanitizeLogArgs(args)); } catch {} },
  warn:  (...args: unknown[]) => { try { log.warn(...sanitizeLogArgs(args));  } catch {} },
  info:  (...args: unknown[]) => { try { log.info(...sanitizeLogArgs(args));  } catch {} },
  debug: (...args: unknown[]) => { try { log.debug(...sanitizeLogArgs(args)); } catch {} },
};
