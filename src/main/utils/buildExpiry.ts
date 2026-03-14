import { DatabaseSync } from 'node:sqlite';
import type { ExpiryStatus } from '../../shared/types';

// Injected by Vite at build time (see vite.main.config.ts)
declare const __BUILD_TIMESTAMP__: number;
declare const __APP_VERSION__: string;

const EXPIRY_DAYS = 28;
const DOWNLOAD_URL = 'https://polyphon.ai/#download';
const NTP_ENDPOINTS = [
  'https://worldtimeapi.org/api/ip',
  'https://1.1.1.1/cdn-cgi/json',
];
const NTP_TIMEOUT_MS = 2000;

export type { ExpiryStatus };

// Returns 'alpha', 'beta', or 'release' based on the semver prerelease segment.
// e.g. "0.1.0-alpha.1" → 'alpha', "0.2.0-beta.3" → 'beta', "1.0.0" → 'release'
export function detectChannel(version: string): 'alpha' | 'beta' | 'release' {
  const lower = version.toLowerCase();
  if (lower.includes('alpha')) return 'alpha';
  if (lower.includes('beta')) return 'beta';
  return 'release';
}

// Plausible unix timestamp bounds (seconds): 2001-09-09 to 2286-11-20
const NTP_SECONDS_MIN = 1_000_000_000;
const NTP_SECONDS_MAX = 10_000_000_000;

// Fetches current time (ms) from NTP-over-HTTPS endpoints.
// Returns null if all endpoints fail, time out, or return out-of-bounds values.
async function fetchRemoteTime(): Promise<number | null> {
  for (const url of NTP_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), NTP_TIMEOUT_MS);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const json = await res.json() as Record<string, unknown>;
      // worldtimeapi: { unixtime: number }
      // cloudflare:   { timestamp: number } (fractional seconds)
      const unixtime = json['unixtime'] ?? json['timestamp'];
      if (
        typeof unixtime === 'number' &&
        unixtime >= NTP_SECONDS_MIN &&
        unixtime <= NTP_SECONDS_MAX
      ) {
        return Math.round(unixtime * 1000);
      }
    } catch {
      // timeout or network error — try next endpoint
    }
  }
  return null;
}

// Reads the last-known-good timestamp floor from SQLite.
// Returns 0 if the row doesn't exist yet.
function readLastKnownGoodTime(db: DatabaseSync): number {
  const row = db
    .prepare('SELECT last_known_good_time FROM build_expiry WHERE id = 1')
    .get() as { last_known_good_time: number } | undefined;
  return row?.last_known_good_time ?? 0;
}

// Persists a new high-water mark for the last-known-good time.
function writeLastKnownGoodTime(db: DatabaseSync, ts: number): void {
  db.prepare(`
    INSERT INTO build_expiry (id, last_known_good_time, updated_at)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET last_known_good_time = excluded.last_known_good_time, updated_at = excluded.updated_at
  `).run(ts, Date.now());
}

export async function checkExpiry(db: DatabaseSync, options?: { skipNtp?: boolean }): Promise<ExpiryStatus> {
  const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
  const buildTimestamp = typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : 0;
  const expiryTimestamp = buildTimestamp + EXPIRY_DAYS * 24 * 60 * 60 * 1000;

  const channel = detectChannel(version);

  // POLYPHON_PREVIEW_EXPIRED=1 forces the expired state for dev preview — must come before release guard
  if (process.env.POLYPHON_PREVIEW_EXPIRED === '1') {
    console.warn('[buildExpiry] POLYPHON_PREVIEW_EXPIRED is active — forcing expired state');
    return {
      expired: true,
      channel,
      version,
      buildTimestamp,
      expiryTimestamp: Date.now() - 1,
      daysRemaining: 0,
      hoursRemaining: 0,
      downloadUrl: DOWNLOAD_URL,
    };
  }

  // Release builds never expire
  if (channel === 'release') {
    return {
      expired: false,
      channel,
      version,
      buildTimestamp,
      expiryTimestamp,
      daysRemaining: Infinity,
      hoursRemaining: Infinity,
      downloadUrl: DOWNLOAD_URL,
    };
  }

  // Dev run: Vite constants were not injected
  if (buildTimestamp === 0) {
    return {
      expired: false,
      channel: 'dev',
      version,
      buildTimestamp: 0,
      expiryTimestamp: Infinity,
      daysRemaining: Infinity,
      hoursRemaining: Infinity,
      downloadUrl: DOWNLOAD_URL,
    };
  }

  const remoteTime = options?.skipNtp ? null : await fetchRemoteTime();
  const localTime = Date.now();
  const lastKnownGood = readLastKnownGoodTime(db);

  // Effective now = max of (remote|local, stored floor) — defeats clock rollback
  const candidateTime = remoteTime ?? localTime;
  const effectiveNow = Math.max(candidateTime, lastKnownGood);

  // Advance the high-water mark if we have a newer reading
  if (effectiveNow > lastKnownGood) {
    writeLastKnownGoodTime(db, effectiveNow);
  }

  const msRemaining = Math.max(0, expiryTimestamp - effectiveNow);
  const daysRemaining = Math.floor(msRemaining / (24 * 60 * 60 * 1000));
  const hoursRemaining = Math.floor(msRemaining / (60 * 60 * 1000));
  const expired = effectiveNow >= expiryTimestamp;

  return {
    expired,
    channel,
    version,
    buildTimestamp,
    expiryTimestamp,
    daysRemaining,
    hoursRemaining,
    downloadUrl: DOWNLOAD_URL,
  };
}
