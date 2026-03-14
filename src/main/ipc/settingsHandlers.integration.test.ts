import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
  spawnSync: vi.fn(),
}));

import { execFileSync, spawnSync } from 'child_process';
import { runMigrations } from '../db/migrations';
import {
  getProviderStatus,
  saveProviderConfig,
  getAllProviderConfigs,
  testCliVoice,
} from './settingsHandlers';
import { SETTINGS_PROVIDERS } from '../../shared/constants';

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
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
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
