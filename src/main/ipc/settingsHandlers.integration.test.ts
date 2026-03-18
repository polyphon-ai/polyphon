import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
  spawnSync: vi.fn(),
}));

// Electron mock — needed for registerSettingsHandlers IPC validation tests
const settingsIpcHandlers = new Map<string, Function>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: Function) => { settingsIpcHandlers.set(ch, fn); },
  },
  dialog: {
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
  },
  nativeImage: {
    createFromPath: vi.fn().mockReturnValue({
      isEmpty: vi.fn().mockReturnValue(false),
      resize: vi.fn().mockReturnValue({ toPNG: vi.fn().mockReturnValue(Buffer.alloc(0)) }),
      getSize: vi.fn().mockReturnValue({ width: 100, height: 100 }),
      toPNG: vi.fn().mockReturnValue(Buffer.alloc(0)),
    }),
  },
  safeStorage: { isEncryptionAvailable: vi.fn().mockReturnValue(false) },
}));

import { execFileSync, spawnSync } from 'child_process';
import { dialog, nativeImage } from 'electron';
import { runMigrations } from '../db/migrations';
import { initFieldEncryption, _resetForTests } from '../security/fieldEncryption';
import {
  getProviderStatus,
  saveProviderConfig,
  getAllProviderConfigs,
  testCliVoice,
  registerSettingsHandlers,
} from './settingsHandlers';
import { IPC, SETTINGS_PROVIDERS } from '../../shared/constants';
import { MAX_CONDUCTOR_CONTEXT } from './validate';

const mockDialog = dialog as unknown as { showOpenDialog: ReturnType<typeof vi.fn> };
const mockNativeImage = nativeImage as unknown as { createFromPath: ReturnType<typeof vi.fn> };

// UUID fixture constants
const COMP_ID = '00000000-0000-0000-0000-000000000001';
const SESS_ID = '00000000-0000-0000-0000-000000000002';
const VOICE_ID = '00000000-0000-0000-0000-000000000003';
const MSG_ID = '00000000-0000-0000-0000-000000000004';
const CP_ID = '00000000-0000-0000-0000-000000000005';

const mockExecFileSync = execFileSync as ReturnType<typeof vi.fn>;
const mockSpawnSync = spawnSync as ReturnType<typeof vi.fn>;

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  runMigrations(db);
  return db;
}

describe('getProviderStatus', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns a status entry for every settings provider', () => {
    const results = getProviderStatus();
    const providers = results.map((r) => r.provider);
    for (const p of SETTINGS_PROVIDERS) {
      expect(providers).toContain(p);
    }
  });

  it('reports status=specific when POLYPHON_ key is present', () => {
    vi.stubEnv('POLYPHON_ANTHROPIC_API_KEY', 'sk-ant-abc123xyz456');
    const results = getProviderStatus();
    const anthropic = results.find((r) => r.provider === 'anthropic')!;
    expect(anthropic.apiKeyStatus.status).toBe('specific');
    // Masked key must not contain the full value
    if (anthropic.apiKeyStatus.status === 'specific') {
      expect(anthropic.apiKeyStatus.maskedKey).not.toBe('sk-ant-abc123xyz456');
      expect(anthropic.apiKeyStatus.maskedKey).toContain('...');
    }
  });

  it('reports status=fallback when only provider key is set', () => {
    vi.stubEnv('POLYPHON_OPENAI_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', 'sk-openai-abc123xyz456');
    const results = getProviderStatus();
    const openai = results.find((r) => r.provider === 'openai')!;
    expect(openai.apiKeyStatus.status).toBe('fallback');
  });

  it('reports status=none when no openai key is set', () => {
    vi.stubEnv('POLYPHON_OPENAI_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    const results = getProviderStatus();
    const openai = results.find((r) => r.provider === 'openai')!;
    expect(openai.apiKeyStatus.status).toBe('none');
  });

  it('never includes the raw API key in the response', () => {
    const rawKey = 'sk-ant-verysecretkey123';
    vi.stubEnv('POLYPHON_ANTHROPIC_API_KEY', rawKey);
    const results = getProviderStatus();
    const json = JSON.stringify(results);
    expect(json).not.toContain(rawKey);
  });
});

describe('saveProviderConfig and getAllProviderConfigs', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    initFieldEncryption(Buffer.alloc(32));
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
    _resetForTests();
  });

  it('saves and retrieves a provider config', () => {
    const saved = saveProviderConfig(db, {
      provider: 'anthropic',
      enabled: true,
      voiceType: 'api',
      defaultModel: 'claude-sonnet-4-5',
      cliCommand: null,
      cliArgs: null,
    });

    expect(saved.provider).toBe('anthropic');
    expect(saved.enabled).toBe(true);
    expect(saved.voiceType).toBe('api');
    expect(saved.defaultModel).toBe('claude-sonnet-4-5');
    expect(saved.id).toBeTruthy();
    expect(saved.createdAt).toBeGreaterThan(0);
  });

  it('returns all saved configs', () => {
    saveProviderConfig(db, {
      provider: 'anthropic',
      enabled: true,
      voiceType: 'api',
      defaultModel: 'claude-opus-4-6',
      cliCommand: null,
      cliArgs: null,
    });
    saveProviderConfig(db, {
      provider: 'openai',
      enabled: false,
      voiceType: 'api',
      defaultModel: 'gpt-4o',
      cliCommand: null,
      cliArgs: null,
    });

    const configs = getAllProviderConfigs(db);
    expect(configs).toHaveLength(2);
    expect(configs.map((c) => c.provider)).toContain('anthropic');
    expect(configs.map((c) => c.provider)).toContain('openai');
  });

  it('upserts on second save for same provider+type', () => {
    saveProviderConfig(db, {
      provider: 'gemini',
      enabled: true,
      voiceType: 'api',
      defaultModel: 'gemini-2.5-flash',
      cliCommand: null,
      cliArgs: null,
    });
    saveProviderConfig(db, {
      provider: 'gemini',
      enabled: false,
      voiceType: 'api',
      defaultModel: 'gemini-1.5-pro',
      cliCommand: null,
      cliArgs: null,
    });

    const configs = getAllProviderConfigs(db);
    expect(configs).toHaveLength(1);
    const gemini = configs[0]!;
    expect(gemini.enabled).toBe(false);
    expect(gemini.voiceType).toBe('api');
    expect(gemini.defaultModel).toBe('gemini-1.5-pro');
    expect(gemini.cliCommand).toBeNull();
  });

  it('creates separate rows for different types of the same provider', () => {
    saveProviderConfig(db, {
      provider: 'anthropic',
      enabled: true,
      voiceType: 'api',
      defaultModel: 'claude-sonnet-4-5',
      cliCommand: null,
      cliArgs: null,
    });
    saveProviderConfig(db, {
      provider: 'anthropic',
      enabled: false,
      voiceType: 'cli',
      defaultModel: null,
      cliCommand: 'claude',
      cliArgs: null,
    });

    const configs = getAllProviderConfigs(db);
    expect(configs).toHaveLength(2);
    const api = configs.find((c) => c.voiceType === 'api')!;
    const cli = configs.find((c) => c.voiceType === 'cli')!;
    expect(api.enabled).toBe(true);
    expect(api.defaultModel).toBe('claude-sonnet-4-5');
    expect(cli.enabled).toBe(false);
    expect(cli.cliCommand).toBe('claude');
  });
});

describe('testCliVoice', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('returns success=false for a non-existent command', () => {
    mockSpawnSync.mockReturnValue({ status: null, error: new Error('not found') });

    const result = testCliVoice('missing-cli');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns an object with success property', () => {
    mockSpawnSync.mockReturnValue({ status: 0, error: undefined, stdout: 'polyphon 1.0.0' });
    mockExecFileSync.mockReturnValue('/usr/local/bin/polyphon\n');

    const result = testCliVoice('polyphon');

    expect(typeof result.success).toBe('boolean');
  });

  it('resolves binary path on success', () => {
    mockSpawnSync.mockReturnValue({ status: 0, error: undefined, stdout: 'polyphon 1.0.0' });
    mockExecFileSync.mockReturnValue('/usr/local/bin/polyphon\n');

    const result = testCliVoice('polyphon');

    if (result.success) {
      expect(result.path).toBe('/usr/local/bin/polyphon');
    }
  });

  it('short-circuits to a fake path when mock voices are enabled', () => {
    vi.stubEnv('POLYPHON_MOCK_VOICES', '1');

    const result = testCliVoice('copilot');

    expect(result).toEqual({ success: true, path: '/mock/bin/copilot' });
    expect(mockSpawnSync).not.toHaveBeenCalled();
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// IPC handler validation — negative-path tests through registerSettingsHandlers
// ---------------------------------------------------------------------------

describe('settings IPC handler validation', () => {
  let db: DatabaseSync;
  const mockVoiceManager = {
    loadCustomProviders: vi.fn(),
    loadTones: vi.fn(),
    loadSystemPromptTemplates: vi.fn(),
  };

  beforeEach(() => {
    settingsIpcHandlers.clear();
    initFieldEncryption(Buffer.alloc(32));
    db = createTestDb();
    registerSettingsHandlers(db, mockVoiceManager as any);
  });

  afterEach(() => {
    db.close();
    _resetForTests();
    vi.clearAllMocks();
  });

  // SETTINGS_TEST_CLI_VOICE
  describe('SETTINGS_TEST_CLI_VOICE validation', () => {
    it('throws for "../../evil"', async () => {
      await expect(settingsIpcHandlers.get(IPC.SETTINGS_TEST_CLI_VOICE)!({}, '../../evil')).rejects.toThrow(
        'must contain only alphanumeric characters',
      );
      expect(mockSpawnSync).not.toHaveBeenCalled();
    });

    it('throws for empty command', async () => {
      await expect(settingsIpcHandlers.get(IPC.SETTINGS_TEST_CLI_VOICE)!({}, '')).rejects.toThrow(
        'command is required',
      );
      expect(mockSpawnSync).not.toHaveBeenCalled();
    });

    it('throws for command exceeding 100 chars', async () => {
      await expect(
        settingsIpcHandlers.get(IPC.SETTINGS_TEST_CLI_VOICE)!({}, 'a'.repeat(101)),
      ).rejects.toThrow('command exceeds maximum length of 100');
      expect(mockSpawnSync).not.toHaveBeenCalled();
    });

    it('throws for "cmd with spaces"', async () => {
      await expect(
        settingsIpcHandlers.get(IPC.SETTINGS_TEST_CLI_VOICE)!({}, 'cmd with spaces'),
      ).rejects.toThrow('must contain only alphanumeric characters');
      expect(mockSpawnSync).not.toHaveBeenCalled();
    });
  });

  // SETTINGS_SAVE_PROVIDER_CONFIG
  describe('SETTINGS_SAVE_PROVIDER_CONFIG validation', () => {
    it('throws for invalid voiceType', async () => {
      await expect(
        settingsIpcHandlers.get(IPC.SETTINGS_SAVE_PROVIDER_CONFIG)!({}, {
          provider: 'anthropic',
          voiceType: 'websocket',
          enabled: true,
          defaultModel: null,
          cliCommand: null,
          cliArgs: null,
        }),
      ).rejects.toThrow('Invalid voiceType: must be one of: api, cli');
    });

    it('throws for unknown provider', async () => {
      await expect(
        settingsIpcHandlers.get(IPC.SETTINGS_SAVE_PROVIDER_CONFIG)!({}, {
          provider: 'unknown-provider',
          voiceType: 'api',
          enabled: true,
          defaultModel: null,
          cliCommand: null,
          cliArgs: null,
        }),
      ).rejects.toThrow('Invalid provider: must be one of:');
    });
  });

  // SETTINGS_FETCH_MODELS
  describe('SETTINGS_FETCH_MODELS validation', () => {
    it('throws for empty provider string', async () => {
      await expect(settingsIpcHandlers.get(IPC.SETTINGS_FETCH_MODELS)!({}, '')).rejects.toThrow(
        'provider is required',
      );
    });
  });

  // SETTINGS_PROBE_MODEL
  describe('SETTINGS_PROBE_MODEL validation', () => {
    it('throws for empty model string', async () => {
      await expect(
        settingsIpcHandlers.get(IPC.SETTINGS_PROBE_MODEL)!({}, 'anthropic', ''),
      ).rejects.toThrow('model is required');
    });
  });

  // SETTINGS_SAVE_USER_PROFILE
  describe('SETTINGS_SAVE_USER_PROFILE validation', () => {
    it('throws for conductorContext exceeding MAX_CONDUCTOR_CONTEXT', async () => {
      const profile = {
        conductorName: 'Alice',
        pronouns: 'she/her',
        conductorContext: 'x'.repeat(MAX_CONDUCTOR_CONTEXT + 1),
        defaultTone: 'collaborative',
        conductorColor: '',
        conductorAvatar: '',
      };
      await expect(
        settingsIpcHandlers.get(IPC.SETTINGS_SAVE_USER_PROFILE)!({}, profile),
      ).rejects.toThrow(`conductorContext exceeds maximum length of ${MAX_CONDUCTOR_CONTEXT}`);
    });

    it('throws for empty defaultTone', async () => {
      const profile = {
        conductorName: 'Alice',
        pronouns: 'she/her',
        conductorContext: '',
        defaultTone: '',
        conductorColor: '',
        conductorAvatar: '',
      };
      await expect(
        settingsIpcHandlers.get(IPC.SETTINGS_SAVE_USER_PROFILE)!({}, profile),
      ).rejects.toThrow('defaultTone is required');
    });
  });

  // SETTINGS_CUSTOM_PROVIDER_CREATE
  describe('SETTINGS_CUSTOM_PROVIDER_CREATE validation', () => {
    it('throws for non-http/https base URL', async () => {
      await expect(
        settingsIpcHandlers.get(IPC.SETTINGS_CUSTOM_PROVIDER_CREATE)!({}, {
          name: 'Test Provider',
          slug: 'test',
          baseUrl: 'ftp://example.com',
          apiKeyEnvVar: null,
          defaultModel: null,
        }),
      ).rejects.toThrow('must be a valid http or https URL');
    });
  });

  // SETTINGS_CUSTOM_PROVIDER_UPDATE
  describe('SETTINGS_CUSTOM_PROVIDER_UPDATE validation', () => {
    it('throws for non-UUID id', async () => {
      await expect(
        settingsIpcHandlers.get(IPC.SETTINGS_CUSTOM_PROVIDER_UPDATE)!({}, 'bad-id', { name: 'X' }),
      ).rejects.toThrow('Invalid id: must be a valid UUID');
    });
  });

  // SETTINGS_CUSTOM_PROVIDER_DELETE
  describe('SETTINGS_CUSTOM_PROVIDER_DELETE validation', () => {
    it('throws for non-UUID id', async () => {
      await expect(
        settingsIpcHandlers.get(IPC.SETTINGS_CUSTOM_PROVIDER_DELETE)!({}, 'bad-id'),
      ).rejects.toThrow('Invalid id: must be a valid UUID');
    });
  });

  // SETTINGS_CUSTOM_PROVIDER_FETCH_MODELS
  describe('SETTINGS_CUSTOM_PROVIDER_FETCH_MODELS validation', () => {
    it('throws for non-UUID id', async () => {
      await expect(
        settingsIpcHandlers.get(IPC.SETTINGS_CUSTOM_PROVIDER_FETCH_MODELS)!({}, 'bad-id'),
      ).rejects.toThrow('Invalid customProviderId: must be a valid UUID');
    });
  });

  // SETTINGS_TONE_UPDATE
  describe('SETTINGS_TONE_UPDATE validation', () => {
    it('throws for empty id', async () => {
      await expect(
        settingsIpcHandlers.get(IPC.SETTINGS_TONE_UPDATE)!({}, '', { name: 'X' }),
      ).rejects.toThrow('id is required');
    });
  });

  // SETTINGS_TONE_DELETE
  describe('SETTINGS_TONE_DELETE validation', () => {
    it('throws for empty id', async () => {
      await expect(
        settingsIpcHandlers.get(IPC.SETTINGS_TONE_DELETE)!({}, ''),
      ).rejects.toThrow('id is required');
    });
  });

  // SETTINGS_SYSTEM_PROMPT_TEMPLATE_UPDATE
  describe('SETTINGS_SYSTEM_PROMPT_TEMPLATE_UPDATE validation', () => {
    it('throws for non-UUID id', async () => {
      await expect(
        settingsIpcHandlers.get(IPC.SETTINGS_SYSTEM_PROMPT_TEMPLATE_UPDATE)!({}, 'bad-id', { name: 'X' }),
      ).rejects.toThrow('Invalid id: must be a valid UUID');
    });
  });

  // SETTINGS_SYSTEM_PROMPT_TEMPLATE_DELETE
  describe('SETTINGS_SYSTEM_PROMPT_TEMPLATE_DELETE validation', () => {
    it('throws for non-UUID id', async () => {
      await expect(
        settingsIpcHandlers.get(IPC.SETTINGS_SYSTEM_PROMPT_TEMPLATE_DELETE)!({}, 'bad-id'),
      ).rejects.toThrow('Invalid id: must be a valid UUID');
    });
  });

  // SETTINGS_UPLOAD_CONDUCTOR_AVATAR
  describe('SETTINGS_UPLOAD_CONDUCTOR_AVATAR', () => {
    it('returns null when dialog is canceled', async () => {
      mockDialog.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
      const result = await settingsIpcHandlers.get(IPC.SETTINGS_UPLOAD_CONDUCTOR_AVATAR)!({});
      expect(result).toBeNull();
    });

    it('returns null when nativeImage is empty (non-image file content)', async () => {
      mockDialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/fake/file.jpg'] });
      const upsertSpy = vi.spyOn(await import('../db/queries/userProfile'), 'upsertUserProfile');
      mockNativeImage.createFromPath.mockReturnValueOnce({ isEmpty: () => true });
      const result = await settingsIpcHandlers.get(IPC.SETTINGS_UPLOAD_CONDUCTOR_AVATAR)!({});
      expect(result).toBeNull();
      expect(upsertSpy).not.toHaveBeenCalled();
      upsertSpy.mockRestore();
    });

    it('returns a data URI for a valid image', async () => {
      mockDialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/fake/photo.png'] });
      const pngBytes = Buffer.from('PNG');
      mockNativeImage.createFromPath.mockReturnValueOnce({
        isEmpty: () => false,
        resize: vi.fn().mockReturnValue({ toPNG: () => pngBytes }),
      });
      const result = await settingsIpcHandlers.get(IPC.SETTINGS_UPLOAD_CONDUCTOR_AVATAR)!({});
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^data:image\/png;base64,/);
    });
  });

  // SETTINGS_PICK_AVATAR_FILE
  describe('SETTINGS_PICK_AVATAR_FILE', () => {
    it('returns null when dialog is canceled', async () => {
      mockDialog.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
      const result = await settingsIpcHandlers.get(IPC.SETTINGS_PICK_AVATAR_FILE)!({});
      expect(result).toBeNull();
    });

    it('returns null when nativeImage is empty (non-image file content)', async () => {
      mockDialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/fake/file.jpg'] });
      mockNativeImage.createFromPath.mockReturnValueOnce({ isEmpty: () => true });
      const result = await settingsIpcHandlers.get(IPC.SETTINGS_PICK_AVATAR_FILE)!({});
      expect(result).toBeNull();
    });

    it('returns a data URI for a valid image', async () => {
      mockDialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/fake/photo.png'] });
      const pngBytes = Buffer.from('PNG');
      mockNativeImage.createFromPath.mockReturnValueOnce({
        isEmpty: () => false,
        getSize: () => ({ width: 100, height: 100 }),
        toPNG: () => pngBytes,
      });
      const result = await settingsIpcHandlers.get(IPC.SETTINGS_PICK_AVATAR_FILE)!({});
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^data:image\/png;base64,/);
    });
  });

  // SETTINGS_SAVE_USER_PROFILE — avatar shape validation
  describe('SETTINGS_SAVE_USER_PROFILE avatar validation', () => {
    function makeProfile(overrides: Record<string, unknown> = {}) {
      return {
        conductorName: 'Alice',
        pronouns: 'she/her',
        conductorContext: '',
        defaultTone: 'collaborative',
        conductorColor: '',
        conductorAvatar: '',
        ...overrides,
      };
    }

    it('rejects non-data-URI avatar value', async () => {
      await expect(
        settingsIpcHandlers.get(IPC.SETTINGS_SAVE_USER_PROFILE)!({}, makeProfile({ conductorAvatar: '/etc/passwd' })),
      ).rejects.toThrow('conductorAvatar must be a valid image data URI or empty string');
    });

    it('rejects non-image data URI', async () => {
      await expect(
        settingsIpcHandlers.get(IPC.SETTINGS_SAVE_USER_PROFILE)!({}, makeProfile({ conductorAvatar: 'data:text/html;base64,abc' })),
      ).rejects.toThrow('conductorAvatar must be a valid image data URI or empty string');
    });

    it('accepts valid data URI avatar', async () => {
      await expect(
        settingsIpcHandlers.get(IPC.SETTINGS_SAVE_USER_PROFILE)!({}, makeProfile({ conductorAvatar: 'data:image/png;base64,abc' })),
      ).resolves.not.toThrow();
    });

    it('accepts empty string avatar removal', async () => {
      await expect(
        settingsIpcHandlers.get(IPC.SETTINGS_SAVE_USER_PROFILE)!({}, makeProfile({ conductorAvatar: '' })),
      ).resolves.not.toThrow();
    });
  });
});
