import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { CREATE_TABLES_SQL } from '../db/schema';
import { initFieldEncryption, _resetForTests as _resetFieldEncryption } from '../security/fieldEncryption';

// --- Electron mocks ---

const mockSend = vi.fn();
const mockGetVersion = vi.fn().mockReturnValue('1.0.0');
const mockIsPackaged = false;

vi.mock('electron', () => ({
  app: {
    getVersion: () => mockGetVersion(),
    isPackaged: mockIsPackaged,
  },
  BrowserWindow: {},
}));

vi.mock('../db/queries/userProfile', () => ({
  getUpdatePreferences: vi.fn().mockReturnValue({ dismissedUpdateVersion: '', updateRemindAfter: 0 }),
}));

// --- Helpers ---

function makeWin() {
  return { webContents: { send: mockSend } } as any;
}

function makeResponse(payload: unknown, ok = true) {
  return {
    ok,
    json: () => Promise.resolve(payload),
  } as any;
}

function makeRelease(overrides: Record<string, unknown> = {}) {
  return { tag_name: 'v1.2.3', draft: false, prerelease: false, ...overrides };
}

// --- Tests ---

describe('parseReleaseVersion (via checkForUpdateNow)', () => {
  let checkForUpdateNow: typeof import('./updateChecker').checkForUpdateNow;
  let _resetForTests: typeof import('./updateChecker')._resetForTests;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn());
    const mod = await import('./updateChecker');
    checkForUpdateNow = mod.checkForUpdateNow;
    _resetForTests = mod._resetForTests;
    _resetForTests();
    mockSend.mockClear();
    mockGetVersion.mockReturnValue('1.0.0');
  });

  function setFetchResponse(payload: unknown, ok = true) {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(payload, ok));
  }

  it('null payload → no update', async () => {
    setFetchResponse(null);
    expect(await checkForUpdateNow(makeWin())).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('undefined payload → no update', async () => {
    setFetchResponse(undefined);
    expect(await checkForUpdateNow(makeWin())).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('non-object (number 42) → no update', async () => {
    setFetchResponse(42);
    expect(await checkForUpdateNow(makeWin())).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('draft: true → no update', async () => {
    setFetchResponse(makeRelease({ draft: true }));
    expect(await checkForUpdateNow(makeWin())).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('prerelease: true → no update', async () => {
    setFetchResponse(makeRelease({ prerelease: true }));
    expect(await checkForUpdateNow(makeWin())).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('draft missing (not a boolean) → no update', async () => {
    setFetchResponse({ tag_name: 'v1.2.3', prerelease: false });
    expect(await checkForUpdateNow(makeWin())).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('prerelease missing (not a boolean) → no update', async () => {
    setFetchResponse({ tag_name: 'v1.2.3', draft: false });
    expect(await checkForUpdateNow(makeWin())).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('tag_name: null → no update', async () => {
    setFetchResponse(makeRelease({ tag_name: null }));
    expect(await checkForUpdateNow(makeWin())).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('tag_name: 123 (number) → no update', async () => {
    setFetchResponse(makeRelease({ tag_name: 123 }));
    expect(await checkForUpdateNow(makeWin())).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('tag_name > 30 chars → no update', async () => {
    setFetchResponse(makeRelease({ tag_name: 'v' + '1'.repeat(30) }));
    expect(await checkForUpdateNow(makeWin())).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('"v1.2.3-beta" → no update', async () => {
    setFetchResponse(makeRelease({ tag_name: 'v1.2.3-beta' }));
    expect(await checkForUpdateNow(makeWin())).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('"v1.2.3+build" → no update', async () => {
    setFetchResponse(makeRelease({ tag_name: 'v1.2.3+build' }));
    expect(await checkForUpdateNow(makeWin())).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('"1.2.3.4" → no update', async () => {
    setFetchResponse(makeRelease({ tag_name: '1.2.3.4' }));
    expect(await checkForUpdateNow(makeWin())).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('"abc" → no update', async () => {
    setFetchResponse(makeRelease({ tag_name: 'abc' }));
    expect(await checkForUpdateNow(makeWin())).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('"1.2.3 " (trailing space) → no update', async () => {
    setFetchResponse(makeRelease({ tag_name: '1.2.3 ' }));
    expect(await checkForUpdateNow(makeWin())).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('"v1.2.3" → returns "1.2.3" (v-prefix stripped)', async () => {
    mockGetVersion.mockReturnValue('1.0.0');
    setFetchResponse(makeRelease({ tag_name: 'v1.2.3' }));
    const result = await checkForUpdateNow(makeWin());
    expect(result).toEqual({ version: '1.2.3' });
  });

  it('"1.2.3" (no prefix) → returns "1.2.3"', async () => {
    mockGetVersion.mockReturnValue('1.0.0');
    setFetchResponse(makeRelease({ tag_name: '1.2.3' }));
    const result = await checkForUpdateNow(makeWin());
    expect(result).toEqual({ version: '1.2.3' });
  });
});

describe('checkForUpdateNow', () => {
  let checkForUpdateNow: typeof import('./updateChecker').checkForUpdateNow;
  let getCachedUpdateInfo: typeof import('./updateChecker').getCachedUpdateInfo;
  let _resetForTests: typeof import('./updateChecker')._resetForTests;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn());
    const mod = await import('./updateChecker');
    checkForUpdateNow = mod.checkForUpdateNow;
    getCachedUpdateInfo = mod.getCachedUpdateInfo;
    _resetForTests = mod._resetForTests;
    _resetForTests();
    mockSend.mockClear();
    mockGetVersion.mockReturnValue('1.0.0');
  });

  function setFetchResponse(payload: unknown, ok = true) {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(payload, ok));
  }

  it('non-200 response → returns null; no webContents.send call', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as any);
    expect(await checkForUpdateNow(makeWin())).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('response.json() throws → returns null; no crash', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.reject(new Error('parse error')),
    } as any);
    expect(await checkForUpdateNow(makeWin())).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('valid newer release → returns UpdateInfo; webContents.send called', async () => {
    setFetchResponse(makeRelease({ tag_name: 'v1.2.3' }));
    const result = await checkForUpdateNow(makeWin());
    expect(result).toEqual({ version: '1.2.3' });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('valid but not-newer release → returns null; getCachedUpdateInfo returns null', async () => {
    mockGetVersion.mockReturnValue('2.0.0');
    setFetchResponse(makeRelease({ tag_name: 'v1.2.3' }));
    expect(await checkForUpdateNow(makeWin())).toBeNull();
    expect(getCachedUpdateInfo()).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('malformed tag (pre-release suffix) → returns null; webContents.send NOT called; cache remains null', async () => {
    setFetchResponse(makeRelease({ tag_name: 'v1.2.3-beta' }));
    expect(await checkForUpdateNow(makeWin())).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
    expect(getCachedUpdateInfo()).toBeNull();
  });

  it('null tag_name → returns null; no side effects', async () => {
    setFetchResponse(makeRelease({ tag_name: null }));
    expect(await checkForUpdateNow(makeWin())).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('stale-cache preservation: malformed response does not clear previously valid cache', async () => {
    // Seed cache with a valid check
    setFetchResponse(makeRelease({ tag_name: 'v1.2.3' }));
    await checkForUpdateNow(makeWin());
    expect(getCachedUpdateInfo()).toEqual({ version: '1.2.3' });

    // Now a malformed response comes in
    mockSend.mockClear();
    setFetchResponse(makeRelease({ tag_name: 'v1.2.3-bad' }));
    await checkForUpdateNow(makeWin());

    // Cache must be preserved
    expect(getCachedUpdateInfo()).toEqual({ version: '1.2.3' });
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('checkForUpdate', () => {
  let checkForUpdate: typeof import('./updateChecker').checkForUpdate;
  let getCachedUpdateInfo: typeof import('./updateChecker').getCachedUpdateInfo;
  let _resetForTests: typeof import('./updateChecker')._resetForTests;
  let getUpdatePreferences: ReturnType<typeof vi.fn>;
  let db: DatabaseSync;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn());
    _resetFieldEncryption();
    initFieldEncryption(Buffer.alloc(32));
    db = new DatabaseSync(':memory:');
    db.exec(CREATE_TABLES_SQL);
    db.prepare(
      'INSERT OR IGNORE INTO user_profile (id, conductor_name, pronouns, conductor_context, default_tone, conductor_color, conductor_avatar, updated_at) VALUES (1, \'\', \'\', \'\', \'collaborative\', \'\', \'\', 0)',
    ).run();

    const userProfileMod = await import('../db/queries/userProfile');
    getUpdatePreferences = vi.mocked(userProfileMod.getUpdatePreferences);
    getUpdatePreferences.mockReturnValue({ dismissedUpdateVersion: '', updateRemindAfter: 0 });

    const mod = await import('./updateChecker');
    checkForUpdate = mod.checkForUpdate;
    getCachedUpdateInfo = mod.getCachedUpdateInfo;
    _resetForTests = mod._resetForTests;
    _resetForTests();
    mockSend.mockClear();
    mockGetVersion.mockReturnValue('1.0.0');
    delete process.env.POLYPHON_E2E;
  });

  afterEach(() => { db.close(); _resetFieldEncryption(); });

  function setFetchResponse(payload: unknown, ok = true) {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(payload, ok));
  }

  it('POLYPHON_E2E set → early return without fetch', async () => {
    process.env.POLYPHON_E2E = '1';
    await checkForUpdate(db, makeWin());
    expect(fetch).not.toHaveBeenCalled();
    expect(getCachedUpdateInfo()).toBeNull();
  });

  it('non-200 response → no cache, no IPC send', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as any);
    await checkForUpdate(db, makeWin());
    expect(getCachedUpdateInfo()).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('valid newer release → sets cache, sends IPC', async () => {
    setFetchResponse(makeRelease({ tag_name: 'v1.2.3' }));
    await checkForUpdate(db, makeWin());
    expect(getCachedUpdateInfo()).toEqual({ version: '1.2.3' });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('malformed tag → no cache, no IPC send', async () => {
    setFetchResponse(makeRelease({ tag_name: 'v1.2.3-rc1' }));
    await checkForUpdate(db, makeWin());
    expect(getCachedUpdateInfo()).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });
});
