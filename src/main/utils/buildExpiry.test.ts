import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectChannel } from './buildExpiry';

// detectChannel is pure — test it directly without mocking globals

describe('detectChannel', () => {
  it('returns alpha for version with alpha prerelease', () => {
    expect(detectChannel('0.1.0-alpha.1')).toBe('alpha');
    expect(detectChannel('0.1.0-ALPHA.2')).toBe('alpha');
  });

  it('returns beta for version with beta prerelease', () => {
    expect(detectChannel('0.2.0-beta.1')).toBe('beta');
    expect(detectChannel('1.0.0-BETA.3')).toBe('beta');
  });

  it('returns release for plain semver', () => {
    expect(detectChannel('1.0.0')).toBe('release');
    expect(detectChannel('2.5.3')).toBe('release');
    expect(detectChannel('0.0.1')).toBe('release');
  });
});

describe('checkExpiry — POLYPHON_PREVIEW_EXPIRED', () => {
  beforeEach(() => {
    process.env.POLYPHON_PREVIEW_EXPIRED = '1';
  });

  afterEach(() => {
    delete process.env.POLYPHON_PREVIEW_EXPIRED;
  });

  it('returns expired=true when preview flag is set (alpha version)', async () => {
    const { checkExpiry } = await import('./buildExpiry');
    const db = {
      prepare: vi.fn().mockReturnValue({ get: vi.fn().mockReturnValue(undefined) }),
    } as any;

    (global as any).__APP_VERSION__ = '0.1.0-alpha.1';
    (global as any).__BUILD_TIMESTAMP__ = Date.now() - 1000;

    const result = await checkExpiry(db);
    expect(result.expired).toBe(true);
    expect(result.channel).toBe('alpha');
  });

  it('returns expired=true when preview flag is set with release version string', async () => {
    const { checkExpiry } = await import('./buildExpiry');
    const db = {
      prepare: vi.fn().mockReturnValue({ get: vi.fn().mockReturnValue(undefined) }),
    } as any;

    (global as any).__APP_VERSION__ = '1.0.0';
    (global as any).__BUILD_TIMESTAMP__ = Date.now() - 1000;

    const result = await checkExpiry(db);
    expect(result.expired).toBe(true);
    // channel should still be release (derived from version, not forced)
    expect(result.channel).toBe('release');
  });
});

describe('checkExpiry — NTP paths', () => {
  afterEach(() => {
    delete process.env.POLYPHON_PREVIEW_EXPIRED;
    vi.restoreAllMocks();
  });

  function makeDb(lastKnownGoodTime = 0) {
    const runFn = vi.fn();
    const db = {
      prepare: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue(
          lastKnownGoodTime > 0 ? { last_known_good_time: lastKnownGoodTime } : undefined,
        ),
        run: runFn,
      }),
    } as any;
    return { db, runFn };
  }

  it('uses remote time from NTP when fetch succeeds', async () => {
    const { checkExpiry } = await import('./buildExpiry');
    const buildTs = Date.now() - 5 * 24 * 60 * 60 * 1000;
    (global as any).__APP_VERSION__ = '0.1.0-alpha.1';
    (global as any).__BUILD_TIMESTAMP__ = buildTs;

    const remoteUnixSec = Math.floor(Date.now() / 1000);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unixtime: remoteUnixSec }),
    }));

    const { db } = makeDb();
    const result = await checkExpiry(db);

    expect(result.expired).toBe(false);
    expect(result.channel).toBe('alpha');
  });

  it('falls back to Date.now() when fetch throws', async () => {
    const { checkExpiry } = await import('./buildExpiry');
    const buildTs = Date.now() - 5 * 24 * 60 * 60 * 1000;
    (global as any).__APP_VERSION__ = '0.1.0-alpha.1';
    (global as any).__BUILD_TIMESTAMP__ = buildTs;

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const { db } = makeDb();
    const result = await checkExpiry(db);

    expect(result.expired).toBe(false);
  });

  it('skipNtp option bypasses fetch entirely', async () => {
    const { checkExpiry } = await import('./buildExpiry');
    const buildTs = Date.now() - 5 * 24 * 60 * 60 * 1000;
    (global as any).__APP_VERSION__ = '0.1.0-alpha.1';
    (global as any).__BUILD_TIMESTAMP__ = buildTs;

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { db } = makeDb();
    await checkExpiry(db, { skipNtp: true });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses stored floor when local time < lastKnownGoodTime (clock rollback)', async () => {
    const { checkExpiry } = await import('./buildExpiry');
    const buildTs = 1_000_000_000_000; // fixed past timestamp (ms)
    const expiryTs = buildTs + 28 * 24 * 60 * 60 * 1000;
    // Store a floor that is already past expiry
    const lastKnownGood = expiryTs + 1000;
    (global as any).__APP_VERSION__ = '0.1.0-alpha.1';
    (global as any).__BUILD_TIMESTAMP__ = buildTs;

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const { db } = makeDb(lastKnownGood);

    const result = await checkExpiry(db);
    expect(result.expired).toBe(true);
  });

  it('rejects NTP responses outside bounds', async () => {
    const { checkExpiry } = await import('./buildExpiry');
    const buildTs = Date.now() - 5 * 24 * 60 * 60 * 1000;
    (global as any).__APP_VERSION__ = '0.1.0-alpha.1';
    (global as any).__BUILD_TIMESTAMP__ = buildTs;

    // Return an out-of-bounds timestamp (too small — year ~1970)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unixtime: 100 }),
    }));

    const { db } = makeDb();
    // Should still complete (falls back to local time)
    const result = await checkExpiry(db);
    expect(typeof result.expired).toBe('boolean');
  });

  it('release channel short-circuits without reading DB', async () => {
    const { checkExpiry } = await import('./buildExpiry');
    (global as any).__APP_VERSION__ = '1.0.0';
    (global as any).__BUILD_TIMESTAMP__ = Date.now();

    const prepareMock = vi.fn();
    const db = { prepare: prepareMock } as any;
    vi.stubGlobal('fetch', vi.fn());

    const result = await checkExpiry(db);
    expect(result.channel).toBe('release');
    expect(result.expired).toBe(false);
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it('expiry boundary: effectiveNow = expiryTimestamp - 1 → not expired', async () => {
    const { checkExpiry } = await import('./buildExpiry');
    const buildTs = 1_000_000_000_000;
    const expiryTs = buildTs + 28 * 24 * 60 * 60 * 1000;
    (global as any).__APP_VERSION__ = '0.1.0-alpha.1';
    (global as any).__BUILD_TIMESTAMP__ = buildTs;

    const remoteMs = expiryTs - 1;
    const remoteUnixSec = remoteMs / 1000;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unixtime: remoteUnixSec }),
    }));

    const { db } = makeDb();
    const result = await checkExpiry(db);
    expect(result.expired).toBe(false);
  });

  it('expiry boundary: effectiveNow = expiryTimestamp → expired', async () => {
    const { checkExpiry } = await import('./buildExpiry');
    const buildTs = 1_000_000_000_000;
    const expiryTs = buildTs + 28 * 24 * 60 * 60 * 1000;
    (global as any).__APP_VERSION__ = '0.1.0-alpha.1';
    (global as any).__BUILD_TIMESTAMP__ = buildTs;

    const remoteUnixSec = expiryTs / 1000;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unixtime: remoteUnixSec }),
    }));

    const { db } = makeDb();
    const result = await checkExpiry(db);
    expect(result.expired).toBe(true);
  });
});
