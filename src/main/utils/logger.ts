import path from 'node:path';

import { app } from 'electron';
import log from 'electron-log/main';

import { ENCRYPTED_FIELDS } from '../db/encryptionManifest';

// Build SENSITIVE_LOG_KEYS from the encryption manifest + explicit extras
function buildSensitiveKeys(): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const columns of Object.values(ENCRYPTED_FIELDS)) {
    for (const col of columns) {
      keys.add(col);
      // Derive camelCase variant
      const camel = col.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      if (camel !== col) keys.add(camel);
    }
  }
  // Explicit extras
  for (const k of ['apiKey', 'api_key', 'authorization', 'Authorization', 'x-api-key', 'x-goog-api-key']) {
    keys.add(k);
  }
  return keys;
}

export const SENSITIVE_LOG_KEYS: ReadonlySet<string> = buildSensitiveKeys();
export const ENCRYPTED_BLOB_RE = /ENC:v1:[A-Za-z0-9+/=]+/g;
export const API_KEY_RE = /sk-\S+|sk-ant-\S+|AIza\S+|gsk_\S+|GOOG\S+|ghp_\S+|github_pat_\S+|Bearer\s+\S+/g;

function sanitizeString(s: string): string {
  return s.replace(ENCRYPTED_BLOB_RE, '[ENCRYPTED]').replace(API_KEY_RE, '[REDACTED]');
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
      if (process.env.POLYPHON_DEBUG === '1' && value.stack) {
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
const _DEBUG_INIT = Symbol.for('polyphon.log.debug.initialized');

if (!_g[_MAIN_INIT]) {
  _g[_MAIN_INIT] = true;
  log.initialize();
}
log.transports.file.level = 'info';
log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs', 'polyphon.log');
log.transports.console.level = process.env.NODE_ENV !== 'production' ? 'debug' : false;

// Optional debug transport — independent logger that captures all levels ≥ debug
let debugLog: typeof log | null = null;
if (process.env.POLYPHON_DEBUG === '1') {
  debugLog = log.create({ logId: 'polyphon-debug' });
  if (!_g[_DEBUG_INIT]) {
    _g[_DEBUG_INIT] = true;
    debugLog.initialize();
  }
  debugLog.transports.file.level = 'debug';
  debugLog.transports.file.resolvePathFn = () =>
    path.join(app.getPath('userData'), 'logs', 'polyphon-debug.log');
  debugLog.transports.console.level = false;
}

export function isDebugEnabled(): boolean {
  return debugLog !== null && debugLog.transports.file.level !== false;
}

export function setDebugEnabled(enabled: boolean): void {
  if (enabled) {
    if (!debugLog) {
      debugLog = log.create({ logId: 'polyphon-debug' });
      debugLog.transports.file.level = 'debug';
      debugLog.transports.file.resolvePathFn = () =>
        path.join(app.getPath('userData'), 'logs', 'polyphon-debug.log');
      debugLog.transports.console.level = false;
    } else {
      debugLog.transports.file.level = 'debug';
    }
  } else if (debugLog) {
    debugLog.transports.file.level = false;
  }
}

export const logger = {
  error: (...args: unknown[]) => {
    try {
      const sanitized = sanitizeLogArgs(args);
      log.error(...sanitized);
      debugLog?.error(...sanitized);
    } catch {}
  },
  warn: (...args: unknown[]) => {
    try {
      const sanitized = sanitizeLogArgs(args);
      log.warn(...sanitized);
      debugLog?.warn(...sanitized);
    } catch {}
  },
  info: (...args: unknown[]) => {
    try {
      const sanitized = sanitizeLogArgs(args);
      log.info(...sanitized);
      debugLog?.info(...sanitized);
    } catch {}
  },
  debug: (...args: unknown[]) => {
    try {
      const sanitized = sanitizeLogArgs(args);
      log.debug(...sanitized);
      debugLog?.debug(...sanitized);
    } catch {}
  },
};
