import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// --- electron-updater mock ---

const autoUpdaterEmitter = new EventEmitter();
const mockCheckForUpdates = vi.fn();
const mockDownloadUpdate = vi.fn();
const mockQuitAndInstall = vi.fn();
const mockSetFeedURL = vi.fn();

vi.mock('electron-updater', () => ({
  autoUpdater: Object.assign(autoUpdaterEmitter, {
    logger: null,
    autoDownload: true,
    autoInstallOnAppQuit: true,
    setFeedURL: mockSetFeedURL,
    checkForUpdates: mockCheckForUpdates,
    downloadUpdate: mockDownloadUpdate,
    quitAndInstall: mockQuitAndInstall,
  }),
}));

const mockGetVersion = vi.fn().mockReturnValue('1.0.0');

vi.mock('electron', () => ({
  app: { getVersion: mockGetVersion, isPackaged: false },
  BrowserWindow: {},
}));

vi.mock('../db/queries/userProfile', () => ({
  getUpdatePreferences: vi.fn().mockReturnValue({ dismissedUpdateVersion: '', updateRemindAfter: 0 }),
  getUpdateChannel: vi.fn().mockReturnValue('stable'),
}));

// --- Helpers ---

function makeWin() {
  return { webContents: { send: vi.fn() } } as any;
}

function makeDb() {
  return {} as any;
}

// --- Tests ---

describe('setupAutoUpdater', () => {
  let setupAutoUpdater: typeof import('./updateChecker').setupAutoUpdater;
  let _resetForTests: typeof import('./updateChecker')._resetForTests;
  let getUpdatePreferences: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    autoUpdaterEmitter.removeAllListeners();
    mockCheckForUpdates.mockResolvedValue(null);
    mockSetFeedURL.mockClear();

    const userProfileMod = await import('../db/queries/userProfile');
    getUpdatePreferences = vi.mocked(userProfileMod.getUpdatePreferences);
    getUpdatePreferences.mockReturnValue({ dismissedUpdateVersion: '', updateRemindAfter: 0 });

    const mod = await import('./updateChecker');
    setupAutoUpdater = mod.setupAutoUpdater;
    _resetForTests = mod._resetForTests;
    _resetForTests();

    delete process.env.POLYPHON_E2E;
  });

  it('POLYPHON_E2E set → skips setup entirely', async () => {
    process.env.POLYPHON_E2E = '1';
    const win = makeWin();
    setupAutoUpdater(makeDb(), win);
    expect(mockSetFeedURL).not.toHaveBeenCalled();
    expect(mockCheckForUpdates).not.toHaveBeenCalled();
  });

  it('configures feed URL pointing at polyphon-ai/releases', async () => {
    const win = makeWin();
    setupAutoUpdater(makeDb(), win);
    expect(mockSetFeedURL).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'github',
      owner: 'polyphon-ai',
      repo: 'releases',
    }));
  });

  it('triggers a startup checkForUpdates', async () => {
    mockCheckForUpdates.mockClear();
    const win = makeWin();
    setupAutoUpdater(makeDb(), win);
    await vi.waitFor(() => expect(mockCheckForUpdates).toHaveBeenCalled());
  });

  it('update-available → sends UPDATE_AVAILABLE IPC and caches info', async () => {
    const win = makeWin();
    setupAutoUpdater(makeDb(), win);
    autoUpdaterEmitter.emit('update-available', { version: '2.0.0' });
    expect(win.webContents.send).toHaveBeenCalledWith('update:available', { version: '2.0.0' });
  });

  it('update-available with dismissed version → no IPC send', async () => {
    getUpdatePreferences.mockReturnValue({ dismissedUpdateVersion: '2.0.0', updateRemindAfter: 0 });
    const win = makeWin();
    setupAutoUpdater(makeDb(), win);
    autoUpdaterEmitter.emit('update-available', { version: '2.0.0' });
    expect(win.webContents.send).not.toHaveBeenCalled();
  });

  it('update-available within remind-after window → no IPC send', async () => {
    getUpdatePreferences.mockReturnValue({ dismissedUpdateVersion: '', updateRemindAfter: Date.now() + 9999999 });
    const win = makeWin();
    setupAutoUpdater(makeDb(), win);
    autoUpdaterEmitter.emit('update-available', { version: '2.0.0' });
    expect(win.webContents.send).not.toHaveBeenCalled();
  });

  it('download-progress → forwards progress event to renderer', async () => {
    const win = makeWin();
    setupAutoUpdater(makeDb(), win);
    const progress = { percent: 42, transferred: 100, total: 200, bytesPerSecond: 1000 };
    autoUpdaterEmitter.emit('download-progress', progress);
    expect(win.webContents.send).toHaveBeenCalledWith('update:download-progress', progress);
  });

  it('update-downloaded → sends UPDATE_READY_TO_INSTALL to renderer', async () => {
    const win = makeWin();
    setupAutoUpdater(makeDb(), win);
    autoUpdaterEmitter.emit('update-downloaded', { version: '2.0.0' });
    expect(win.webContents.send).toHaveBeenCalledWith('update:ready-to-install', { version: '2.0.0' });
  });
});

describe('checkForUpdateNow', () => {
  let checkForUpdateNow: typeof import('./updateChecker').checkForUpdateNow;
  let getCachedUpdateInfo: typeof import('./updateChecker').getCachedUpdateInfo;
  let setupAutoUpdater: typeof import('./updateChecker').setupAutoUpdater;
  let _resetForTests: typeof import('./updateChecker')._resetForTests;

  beforeEach(async () => {
    vi.resetModules();
    autoUpdaterEmitter.removeAllListeners();
    mockCheckForUpdates.mockResolvedValue(null);
    mockSetFeedURL.mockClear();

    const userProfileMod = await import('../db/queries/userProfile');
    vi.mocked(userProfileMod.getUpdatePreferences).mockReturnValue({ dismissedUpdateVersion: '', updateRemindAfter: 0 });

    const mod = await import('./updateChecker');
    checkForUpdateNow = mod.checkForUpdateNow;
    getCachedUpdateInfo = mod.getCachedUpdateInfo;
    setupAutoUpdater = mod.setupAutoUpdater;
    _resetForTests = mod._resetForTests;
    _resetForTests();

    delete process.env.POLYPHON_E2E;
  });

  it('no update available → returns null', async () => {
    mockCheckForUpdates.mockResolvedValue(null);
    const result = await checkForUpdateNow();
    expect(result).toBeNull();
  });

  it('checkForUpdates throws → returns null without crashing', async () => {
    mockCheckForUpdates.mockRejectedValue(new Error('network error'));
    const result = await checkForUpdateNow();
    expect(result).toBeNull();
  });

  it('update-available fires during manual check → bypasses dismissal prefs and returns cached info', async () => {
    const win = makeWin();
    const userProfileMod = await import('../db/queries/userProfile');
    vi.mocked(userProfileMod.getUpdatePreferences).mockReturnValue({ dismissedUpdateVersion: '2.0.0', updateRemindAfter: 0 });

    setupAutoUpdater(makeDb(), win);

    // Simulate checkForUpdates triggering update-available before resolving
    mockCheckForUpdates.mockImplementation(async () => {
      autoUpdaterEmitter.emit('update-available', { version: '2.0.0' });
      return { updateInfo: { version: '2.0.0' } };
    });

    const result = await checkForUpdateNow();
    expect(result).toEqual({ version: '2.0.0' });
    // IPC should have been sent even though the version is in the dismissed list
    expect(win.webContents.send).toHaveBeenCalledWith('update:available', { version: '2.0.0' });
  });
});

describe('changeChannel', () => {
  let changeChannel: typeof import('./updateChecker').changeChannel;
  let getCachedUpdateInfo: typeof import('./updateChecker').getCachedUpdateInfo;
  let setupAutoUpdater: typeof import('./updateChecker').setupAutoUpdater;
  let _resetForTests: typeof import('./updateChecker')._resetForTests;

  beforeEach(async () => {
    vi.resetModules();
    autoUpdaterEmitter.removeAllListeners();
    mockCheckForUpdates.mockResolvedValue(null);
    mockSetFeedURL.mockClear();
    mockGetVersion.mockReturnValue('1.0.0');

    const userProfileMod = await import('../db/queries/userProfile');
    vi.mocked(userProfileMod.getUpdatePreferences).mockReturnValue({ dismissedUpdateVersion: '', updateRemindAfter: 0 });
    vi.mocked(userProfileMod.getUpdateChannel).mockReturnValue('stable');

    const mod = await import('./updateChecker');
    changeChannel = mod.changeChannel;
    getCachedUpdateInfo = mod.getCachedUpdateInfo;
    setupAutoUpdater = mod.setupAutoUpdater;
    _resetForTests = mod._resetForTests;
    _resetForTests();

    delete process.env.POLYPHON_E2E;
  });

  it('switching to preview sets allowPrerelease and re-checks via autoUpdater', async () => {
    const { autoUpdater } = await import('electron-updater');
    const win = makeWin();
    setupAutoUpdater(makeDb(), win);
    mockCheckForUpdates.mockClear();

    changeChannel('preview');

    expect((autoUpdater as any).allowPrerelease).toBe(true);
    expect(mockCheckForUpdates).toHaveBeenCalledTimes(1);
  });

  it('switching to stable on a stable build clears allowPrerelease and re-checks via autoUpdater', async () => {
    const { autoUpdater } = await import('electron-updater');
    mockGetVersion.mockReturnValue('1.0.0');
    const win = makeWin();
    setupAutoUpdater(makeDb(), win);
    mockCheckForUpdates.mockClear();

    changeChannel('stable');

    expect((autoUpdater as any).allowPrerelease).toBe(false);
    expect(mockCheckForUpdates).toHaveBeenCalledTimes(1);
  });

  it('switching to stable while on a pre-release fetches GitHub API instead of using autoUpdater', async () => {
    mockGetVersion.mockReturnValue('1.1.0-alpha.1');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: 'v1.0.0', prerelease: false }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const win = makeWin();
    setupAutoUpdater(makeDb(), win);
    mockCheckForUpdates.mockClear();

    changeChannel('stable');

    await vi.waitFor(() =>
      expect(win.webContents.send).toHaveBeenCalledWith('update:available', { version: '1.0.0' })
    );

    expect(mockCheckForUpdates).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith('https://api.github.com/repos/polyphon-ai/releases/releases/latest');
    expect(getCachedUpdateInfo()).toEqual({ version: '1.0.0' });

    vi.unstubAllGlobals();
  });

  it('switching to stable while on a pre-release: API failure → no crash, no banner', async () => {
    mockGetVersion.mockReturnValue('1.1.0-alpha.1');
    const mockFetch = vi.fn().mockRejectedValue(new Error('network error'));
    vi.stubGlobal('fetch', mockFetch);

    const win = makeWin();
    setupAutoUpdater(makeDb(), win);

    changeChannel('stable');
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    // Let the async chain settle — no send should follow
    await new Promise((r) => setTimeout(r, 20));

    expect(win.webContents.send).not.toHaveBeenCalled();
    expect(getCachedUpdateInfo()).toBeNull();

    vi.unstubAllGlobals();
  });

  it('switching to stable while on a pre-release: API returns non-ok → no banner', async () => {
    mockGetVersion.mockReturnValue('1.1.0-alpha.1');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', mockFetch);

    const win = makeWin();
    setupAutoUpdater(makeDb(), win);

    changeChannel('stable');
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));

    expect(win.webContents.send).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

describe('downloadUpdate and quitAndInstall', () => {
  let downloadUpdate: typeof import('./updateChecker').downloadUpdate;
  let quitAndInstall: typeof import('./updateChecker').quitAndInstall;

  beforeEach(async () => {
    vi.resetModules();
    autoUpdaterEmitter.removeAllListeners();
    mockDownloadUpdate.mockResolvedValue(undefined);
    mockQuitAndInstall.mockClear();

    const mod = await import('./updateChecker');
    downloadUpdate = mod.downloadUpdate;
    quitAndInstall = mod.quitAndInstall;
  });

  it('downloadUpdate → delegates to autoUpdater.downloadUpdate', async () => {
    await downloadUpdate();
    expect(mockDownloadUpdate).toHaveBeenCalledTimes(1);
  });

  it('quitAndInstall → delegates to autoUpdater.quitAndInstall with silent=false', () => {
    quitAndInstall();
    expect(mockQuitAndInstall).toHaveBeenCalledWith(false, false);
  });
});
