// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useSettingsStore } from './settingsStore';
import type { ProviderConfig } from '../../shared/types';

function stubPolyphonSettings(overrides: Record<string, unknown> = {}) {
  vi.stubGlobal('polyphon', {
    settings: {
      getProviderStatus: vi.fn().mockResolvedValue([]),
      getProviderConfig: vi.fn().mockResolvedValue([]),
      getUserProfile: vi.fn().mockResolvedValue({ conductorName: '', conductorContext: '', defaultTone: 'collaborative', updatedAt: 0 }),
      saveProviderConfig: vi.fn().mockResolvedValue({ provider: 'anthropic', enabled: true, voiceType: 'api', defaultModel: 'claude-opus-4-6', cliCommand: null, cliArgs: null, id: 'pc-1', createdAt: 1000, updatedAt: 1000 }),
      testCliVoice: vi.fn().mockResolvedValue({ success: true }),
      fetchModels: vi.fn().mockResolvedValue({ models: ['gpt-4o', 'gpt-4o-mini'] }),
      saveUserProfile: vi.fn().mockResolvedValue({ conductorName: '', conductorContext: '', defaultTone: 'collaborative', updatedAt: 1000 }),
      listCustomProviders: vi.fn().mockResolvedValue([]),
      listTones: vi.fn().mockResolvedValue([]),
      listSystemPromptTemplates: vi.fn().mockResolvedValue([]),
      createTone: vi.fn(),
      updateTone: vi.fn(),
      deleteTone: vi.fn(),
      createSystemPromptTemplate: vi.fn(),
      updateSystemPromptTemplate: vi.fn(),
      deleteSystemPromptTemplate: vi.fn(),
      ...overrides,
    },
  });
}

beforeEach(() => {
  useSettingsStore.setState({
    providerStatuses: {},
    providerConfigs: {},
    cliTestStates: {},
    modelFetchStates: {},
    saveConfirmation: null,
    loading: false,
    error: null,
    tones: [],
    systemPromptTemplates: [],
    customProviders: [],
    customProviderModelFetchStates: {},
  });
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('load()', () => {
  it('sets loading=true then loading=false after success', async () => {
    stubPolyphonSettings();
    const loadPromise = useSettingsStore.getState().load();
    expect(useSettingsStore.getState().loading).toBe(true);
    await loadPromise;
    expect(useSettingsStore.getState().loading).toBe(false);
  });

  it('populates providerStatuses from API response', async () => {
    stubPolyphonSettings({
      getProviderStatus: vi.fn().mockResolvedValue([
        { provider: 'anthropic', apiKeyStatus: { status: 'specific', varName: 'ANTHROPIC_API_KEY', maskedKey: 'sk-***' } },
      ]),
    });
    await useSettingsStore.getState().load();
    expect(useSettingsStore.getState().providerStatuses['anthropic']).toBeDefined();
    expect(useSettingsStore.getState().providerStatuses['anthropic']!.apiKeyStatus.status).toBe('specific');
  });

  it('populates providerConfigs from API response', async () => {
    const config: ProviderConfig = { id: 'pc-1', provider: 'openai', enabled: true, voiceType: 'api', defaultModel: 'gpt-4o', cliCommand: null, cliArgs: null, createdAt: 1000, updatedAt: 1000 };
    stubPolyphonSettings({ getProviderConfig: vi.fn().mockResolvedValue([config]) });
    await useSettingsStore.getState().load();
    expect(useSettingsStore.getState().providerConfigs['openai']?.api).toMatchObject({ id: 'pc-1', provider: 'openai' });
  });

  it('creates default config entry for providers not in DB response', async () => {
    stubPolyphonSettings({ getProviderConfig: vi.fn().mockResolvedValue([]) });
    await useSettingsStore.getState().load();
    const { providerConfigs } = useSettingsStore.getState();
    expect(providerConfigs['anthropic']).toBeDefined();
    expect(providerConfigs['openai']).toBeDefined();
    expect(providerConfigs['gemini']).toBeDefined();
    // Default api config has empty id
    expect(providerConfigs['anthropic']?.api?.id).toBe('');
  });

  it('sets error state when API throws', async () => {
    stubPolyphonSettings({ getProviderStatus: vi.fn().mockRejectedValue(new Error('network failure')) });
    await useSettingsStore.getState().load();
    expect(useSettingsStore.getState().error).toBe('network failure');
    expect(useSettingsStore.getState().loading).toBe(false);
  });
});

describe('saveConfig()', () => {
  it('updates providerConfigs with saved value', async () => {
    stubPolyphonSettings();
    const config = { provider: 'anthropic', enabled: true, voiceType: 'api' as const, defaultModel: 'claude-opus-4-6', cliCommand: null, cliArgs: null };
    await useSettingsStore.getState().saveConfig(config);
    expect(useSettingsStore.getState().providerConfigs['anthropic']?.api).toBeDefined();
    expect(useSettingsStore.getState().providerConfigs['anthropic']?.api?.id).toBe('pc-1');
  });

  it('sets saveConfirmation to provider name', async () => {
    stubPolyphonSettings();
    const config = { provider: 'anthropic', enabled: true, voiceType: 'api' as const, defaultModel: null, cliCommand: null, cliArgs: null };
    await useSettingsStore.getState().saveConfig(config);
    expect(useSettingsStore.getState().saveConfirmation).toBe('anthropic');
  });

  it('sets error on failure', async () => {
    stubPolyphonSettings({ saveProviderConfig: vi.fn().mockRejectedValue(new Error('save failed')) });
    const config = { provider: 'anthropic', enabled: true, voiceType: 'api' as const, defaultModel: null, cliCommand: null, cliArgs: null };
    await useSettingsStore.getState().saveConfig(config);
    expect(useSettingsStore.getState().error).toBe('save failed');
  });
});

describe('testCli()', () => {
  it('transitions status: idle → testing → success', async () => {
    stubPolyphonSettings({ testCliVoice: vi.fn().mockResolvedValue({ success: true, path: '/usr/bin/claude' }) });
    const promise = useSettingsStore.getState().testCli('anthropic', 'claude');
    expect(useSettingsStore.getState().cliTestStates['anthropic']?.status).toBe('testing');
    await promise;
    expect(useSettingsStore.getState().cliTestStates['anthropic']?.status).toBe('success');
  });

  it('transitions status: idle → testing → error when result.success=false', async () => {
    stubPolyphonSettings({ testCliVoice: vi.fn().mockResolvedValue({ success: false, error: 'not found' }) });
    await useSettingsStore.getState().testCli('anthropic', 'claude');
    expect(useSettingsStore.getState().cliTestStates['anthropic']?.status).toBe('error');
    expect(useSettingsStore.getState().cliTestStates['anthropic']?.result?.success).toBe(false);
  });

  it('sets error result when exception thrown', async () => {
    stubPolyphonSettings({ testCliVoice: vi.fn().mockRejectedValue(new Error('spawn failed')) });
    await useSettingsStore.getState().testCli('anthropic', 'claude');
    const state = useSettingsStore.getState().cliTestStates['anthropic'];
    expect(state?.status).toBe('error');
    expect(state?.result?.error).toBe('spawn failed');
  });
});

describe('clearCliTest()', () => {
  it('removes provider from cliTestStates', () => {
    useSettingsStore.setState({ cliTestStates: { anthropic: { status: 'success' } } });
    useSettingsStore.getState().clearCliTest('anthropic');
    expect(useSettingsStore.getState().cliTestStates['anthropic']).toBeUndefined();
  });
});

describe('fetchModels()', () => {
  it('transitions status: idle → fetching → done', async () => {
    stubPolyphonSettings();
    const promise = useSettingsStore.getState().fetchModels('openai');
    expect(useSettingsStore.getState().modelFetchStates['openai']?.status).toBe('fetching');
    await promise;
    expect(useSettingsStore.getState().modelFetchStates['openai']?.status).toBe('done');
  });

  it('stores returned models list', async () => {
    stubPolyphonSettings({ fetchModels: vi.fn().mockResolvedValue({ models: ['gpt-4o', 'gpt-4o-mini'] }) });
    await useSettingsStore.getState().fetchModels('openai');
    expect(useSettingsStore.getState().modelFetchStates['openai']?.models).toEqual(['gpt-4o', 'gpt-4o-mini']);
  });

  it('sets error state when fetchModels API returns error field', async () => {
    stubPolyphonSettings({ fetchModels: vi.fn().mockResolvedValue({ models: [], error: 'invalid key' }) });
    await useSettingsStore.getState().fetchModels('openai');
    const state = useSettingsStore.getState().modelFetchStates['openai'];
    expect(state?.status).toBe('error');
    expect(state?.error).toBe('invalid key');
  });

  it('sets error state when exception thrown', async () => {
    stubPolyphonSettings({ fetchModels: vi.fn().mockRejectedValue(new Error('timeout')) });
    await useSettingsStore.getState().fetchModels('openai');
    const state = useSettingsStore.getState().modelFetchStates['openai'];
    expect(state?.status).toBe('error');
    expect(state?.error).toBe('timeout');
  });
});

const mockTone = { id: 'tone-uuid', name: 'Casual', description: 'Laid-back.', isBuiltin: false, sortOrder: 6, createdAt: 1000, updatedAt: 1000 };
const mockTemplate = { id: 'tmpl-uuid', name: 'Code Review', content: 'Review carefully.', createdAt: 1000, updatedAt: 1000 };

describe('loadTones()', () => {
  it('populates tones from API response', async () => {
    stubPolyphonSettings({ listTones: vi.fn().mockResolvedValue([mockTone]) });
    await useSettingsStore.getState().loadTones();
    expect(useSettingsStore.getState().tones).toHaveLength(1);
    expect(useSettingsStore.getState().tones[0]!.name).toBe('Casual');
  });

  it('sets error on failure', async () => {
    stubPolyphonSettings({ listTones: vi.fn().mockRejectedValue(new Error('db error')) });
    await useSettingsStore.getState().loadTones();
    expect(useSettingsStore.getState().error).toBe('db error');
  });
});

describe('createTone()', () => {
  it('appends new tone to tones list', async () => {
    stubPolyphonSettings({ createTone: vi.fn().mockResolvedValue(mockTone) });
    await useSettingsStore.getState().createTone({ name: 'Casual', description: 'Laid-back.' });
    expect(useSettingsStore.getState().tones).toHaveLength(1);
    expect(useSettingsStore.getState().tones[0]!.id).toBe('tone-uuid');
  });
});

describe('updateTone()', () => {
  it('replaces the updated tone in the list', async () => {
    useSettingsStore.setState({ tones: [mockTone] });
    const updated = { ...mockTone, name: 'Updated' };
    stubPolyphonSettings({ updateTone: vi.fn().mockResolvedValue(updated) });
    await useSettingsStore.getState().updateTone('tone-uuid', { name: 'Updated' });
    expect(useSettingsStore.getState().tones[0]!.name).toBe('Updated');
  });
});

describe('deleteTone()', () => {
  it('removes the tone from the list', async () => {
    useSettingsStore.setState({ tones: [mockTone] });
    stubPolyphonSettings({ deleteTone: vi.fn().mockResolvedValue(undefined) });
    await useSettingsStore.getState().deleteTone('tone-uuid');
    expect(useSettingsStore.getState().tones).toHaveLength(0);
  });
});

describe('loadSystemPromptTemplates()', () => {
  it('populates templates from API response', async () => {
    stubPolyphonSettings({ listSystemPromptTemplates: vi.fn().mockResolvedValue([mockTemplate]) });
    await useSettingsStore.getState().loadSystemPromptTemplates();
    expect(useSettingsStore.getState().systemPromptTemplates).toHaveLength(1);
    expect(useSettingsStore.getState().systemPromptTemplates[0]!.name).toBe('Code Review');
  });

  it('sets error on failure', async () => {
    stubPolyphonSettings({ listSystemPromptTemplates: vi.fn().mockRejectedValue(new Error('db error')) });
    await useSettingsStore.getState().loadSystemPromptTemplates();
    expect(useSettingsStore.getState().error).toBe('db error');
  });
});

describe('createSystemPromptTemplate()', () => {
  it('appends new template to list', async () => {
    stubPolyphonSettings({ createSystemPromptTemplate: vi.fn().mockResolvedValue(mockTemplate) });
    await useSettingsStore.getState().createSystemPromptTemplate({ name: 'Code Review', content: 'Review carefully.' });
    expect(useSettingsStore.getState().systemPromptTemplates).toHaveLength(1);
    expect(useSettingsStore.getState().systemPromptTemplates[0]!.id).toBe('tmpl-uuid');
  });
});

describe('updateSystemPromptTemplate()', () => {
  it('replaces the updated template in the list', async () => {
    useSettingsStore.setState({ systemPromptTemplates: [mockTemplate] });
    const updated = { ...mockTemplate, name: 'Updated' };
    stubPolyphonSettings({ updateSystemPromptTemplate: vi.fn().mockResolvedValue(updated) });
    await useSettingsStore.getState().updateSystemPromptTemplate('tmpl-uuid', { name: 'Updated' });
    expect(useSettingsStore.getState().systemPromptTemplates[0]!.name).toBe('Updated');
  });
});

describe('deleteSystemPromptTemplate()', () => {
  it('removes the template from the list', async () => {
    useSettingsStore.setState({ systemPromptTemplates: [mockTemplate] });
    stubPolyphonSettings({ deleteSystemPromptTemplate: vi.fn().mockResolvedValue(undefined) });
    await useSettingsStore.getState().deleteSystemPromptTemplate('tmpl-uuid');
    expect(useSettingsStore.getState().systemPromptTemplates).toHaveLength(0);
  });
});

describe('load() includes tones and templates', () => {
  it('loads tones and templates together with other settings', async () => {
    stubPolyphonSettings({
      listTones: vi.fn().mockResolvedValue([mockTone]),
      listSystemPromptTemplates: vi.fn().mockResolvedValue([mockTemplate]),
    });
    await useSettingsStore.getState().load();
    expect(useSettingsStore.getState().tones).toHaveLength(1);
    expect(useSettingsStore.getState().systemPromptTemplates).toHaveLength(1);
  });
});

const mockCustomProvider = {
  id: 'cp-1',
  name: 'Ollama',
  slug: 'ollama',
  baseUrl: 'http://localhost:11434/v1',
  apiKeyEnvVar: null,
  defaultModel: 'llama3.2',
  deleted: false,
  createdAt: 1000,
  updatedAt: 1000,
  apiKeyStatus: null,
};

describe('loadCustomProviders()', () => {
  it('populates customProviders from API response', async () => {
    stubPolyphonSettings({ listCustomProviders: vi.fn().mockResolvedValue([mockCustomProvider]) });
    await useSettingsStore.getState().loadCustomProviders();
    expect(useSettingsStore.getState().customProviders).toHaveLength(1);
    expect(useSettingsStore.getState().customProviders[0]!.name).toBe('Ollama');
  });

  it('sets error on failure', async () => {
    stubPolyphonSettings({ listCustomProviders: vi.fn().mockRejectedValue(new Error('db error')) });
    await useSettingsStore.getState().loadCustomProviders();
    expect(useSettingsStore.getState().error).toBe('db error');
  });
});

describe('createCustomProvider()', () => {
  it('appends new custom provider to the list', async () => {
    stubPolyphonSettings({ createCustomProvider: vi.fn().mockResolvedValue(mockCustomProvider) });
    await useSettingsStore.getState().createCustomProvider({
      name: 'Ollama',
      slug: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      apiKeyEnvVar: null,
      defaultModel: 'llama3.2',
    });
    expect(useSettingsStore.getState().customProviders).toHaveLength(1);
    expect(useSettingsStore.getState().customProviders[0]!.id).toBe('cp-1');
  });

  it('returns the created provider', async () => {
    stubPolyphonSettings({ createCustomProvider: vi.fn().mockResolvedValue(mockCustomProvider) });
    const result = await useSettingsStore.getState().createCustomProvider({
      name: 'Ollama',
      slug: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      apiKeyEnvVar: null,
      defaultModel: 'llama3.2',
    });
    expect(result.id).toBe('cp-1');
  });
});

describe('updateCustomProvider()', () => {
  it('replaces the updated provider in the list', async () => {
    useSettingsStore.setState({ customProviders: [mockCustomProvider] });
    const updated = { ...mockCustomProvider, name: 'Renamed Ollama' };
    stubPolyphonSettings({ updateCustomProvider: vi.fn().mockResolvedValue(updated) });
    await useSettingsStore.getState().updateCustomProvider('cp-1', { name: 'Renamed Ollama' });
    expect(useSettingsStore.getState().customProviders[0]!.name).toBe('Renamed Ollama');
  });

  it('preserves other providers when updating one', async () => {
    const second = { ...mockCustomProvider, id: 'cp-2', name: 'vLLM', slug: 'vllm' };
    useSettingsStore.setState({ customProviders: [mockCustomProvider, second] });
    const updated = { ...mockCustomProvider, name: 'Renamed Ollama' };
    stubPolyphonSettings({ updateCustomProvider: vi.fn().mockResolvedValue(updated) });
    await useSettingsStore.getState().updateCustomProvider('cp-1', { name: 'Renamed Ollama' });
    expect(useSettingsStore.getState().customProviders).toHaveLength(2);
    expect(useSettingsStore.getState().customProviders[1]!.name).toBe('vLLM');
  });
});

describe('deleteCustomProvider()', () => {
  it('removes the matching custom provider', async () => {
    useSettingsStore.setState({ customProviders: [mockCustomProvider] });
    stubPolyphonSettings({ deleteCustomProvider: vi.fn().mockResolvedValue(undefined) });
    await useSettingsStore.getState().deleteCustomProvider('cp-1');
    expect(useSettingsStore.getState().customProviders).toHaveLength(0);
  });

  it('preserves other providers when deleting one', async () => {
    const second = { ...mockCustomProvider, id: 'cp-2', name: 'vLLM', slug: 'vllm' };
    useSettingsStore.setState({ customProviders: [mockCustomProvider, second] });
    stubPolyphonSettings({ deleteCustomProvider: vi.fn().mockResolvedValue(undefined) });
    await useSettingsStore.getState().deleteCustomProvider('cp-1');
    expect(useSettingsStore.getState().customProviders).toHaveLength(1);
    expect(useSettingsStore.getState().customProviders[0]!.id).toBe('cp-2');
  });
});
