// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import VoiceSelector from './VoiceSelector';
import { useSettingsStore } from '../../store/settingsStore';
import type { ProviderConfig, CustomProviderWithStatus, ProviderStatus, UserProfile } from '../../../shared/types';
import type { ProviderConfigsByType } from '../../store/settingsStore';

afterEach(cleanup);

function makeConfig(
  provider: string,
  overrides: Partial<ProviderConfig> = {},
): ProviderConfig {
  return {
    id: `cfg-${provider}`,
    provider,
    enabled: true,
    voiceType: 'api',
    defaultModel: null,
    cliCommand: null,
    cliArgs: null,
    yoloMode: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

/** Build the nested providerConfigs shape used by the store. */
function makeProviderConfigs(
  entries: Array<{ provider: string; voiceType: 'api' | 'cli'; overrides?: Partial<ProviderConfig> }>,
): ProviderConfigsByType {
  const result: ProviderConfigsByType = {};
  for (const { provider, voiceType, overrides } of entries) {
    if (!result[provider]) result[provider] = {};
    result[provider]![voiceType] = makeConfig(provider, { voiceType, ...overrides });
  }
  return result;
}

function makeProviderStatus(provider: string, status: 'specific' | 'fallback' | 'none'): ProviderStatus {
  if (status === 'none') {
    return { provider, apiKeyStatus: { status: 'none', specificVar: `POLYPHON_${provider.toUpperCase()}_API_KEY`, fallbackVar: `${provider.toUpperCase()}_API_KEY` } };
  }
  return { provider, apiKeyStatus: { status, varName: `${provider.toUpperCase()}_API_KEY`, maskedKey: 'sk-****' } };
}

function makeCustomProvider(overrides: Partial<CustomProviderWithStatus> = {}): CustomProviderWithStatus {
  return {
    id: 'cp-1',
    name: 'Ollama',
    slug: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    apiKeyEnvVar: null,
    defaultModel: null,
    deleted: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    apiKeyStatus: null,
    ...overrides,
  };
}

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    conductorName: '',
    pronouns: '',
    conductorContext: '',
    defaultTone: 'collaborative',
    conductorColor: '',
    conductorAvatar: '',
    updatedAt: 0,
    ...overrides,
  };
}

describe('VoiceSelector', () => {
  it('shows prompt to enable providers when providerConfigs is empty and no custom providers', () => {
    useSettingsStore.setState({ providerConfigs: {}, customProviders: [], tones: [], systemPromptTemplates: [] });
    render(<VoiceSelector onSelect={vi.fn()} />);
    expect(screen.getByText(/Enable providers in/)).toBeTruthy();
  });

  it('shows prompt to enable providers when all providers are disabled and no custom providers', () => {
    useSettingsStore.setState({
      providerConfigs: makeProviderConfigs([
        { provider: 'anthropic', voiceType: 'api', overrides: { enabled: false } },
        { provider: 'openai', voiceType: 'api', overrides: { enabled: false } },
      ]),
      customProviders: [],
      tones: [],
      systemPromptTemplates: [],
    });
    render(<VoiceSelector onSelect={vi.fn()} />);
    expect(screen.getByText(/Enable providers in/)).toBeTruthy();
  });

  it('shows an enabled provider in the grid', () => {
    useSettingsStore.setState({
      providerConfigs: makeProviderConfigs([{ provider: 'anthropic', voiceType: 'api' }]),
      customProviders: [],
      tones: [],
      systemPromptTemplates: [],
    });
    render(<VoiceSelector onSelect={vi.fn()} />);
    expect(screen.getByText('Anthropic')).toBeTruthy();
  });

  it('does not show disabled providers', () => {
    useSettingsStore.setState({
      providerConfigs: makeProviderConfigs([
        { provider: 'anthropic', voiceType: 'api', overrides: { enabled: false } },
        { provider: 'openai', voiceType: 'api' },
      ]),
      customProviders: [],
      tones: [],
      systemPromptTemplates: [],
    });
    render(<VoiceSelector onSelect={vi.fn()} />);
    expect(screen.queryByText('Anthropic')).toBeNull();
    expect(screen.getByText('OpenAI')).toBeTruthy();
  });

  it('shows all enabled providers', () => {
    useSettingsStore.setState({
      providerConfigs: makeProviderConfigs([
        { provider: 'anthropic', voiceType: 'api' },
        { provider: 'openai', voiceType: 'api' },
        { provider: 'gemini', voiceType: 'api' },
      ]),
      customProviders: [],
      tones: [],
      systemPromptTemplates: [],
    });
    render(<VoiceSelector onSelect={vi.fn()} />);
    expect(screen.getByText('Anthropic')).toBeTruthy();
    expect(screen.getByText('OpenAI')).toBeTruthy();
    expect(screen.getByText('Gemini')).toBeTruthy();
  });

  it('shows custom providers alongside built-in providers', () => {
    useSettingsStore.setState({
      providerConfigs: makeProviderConfigs([{ provider: 'anthropic', voiceType: 'api' }]),
      customProviders: [makeCustomProvider({ name: 'Ollama', slug: 'ollama' })],
      tones: [],
      systemPromptTemplates: [],
    });
    render(<VoiceSelector onSelect={vi.fn()} />);
    expect(screen.getByText('Anthropic')).toBeTruthy();
    expect(screen.getByText('Ollama')).toBeTruthy();
  });

  it('shows custom providers even when no built-in providers are enabled', () => {
    useSettingsStore.setState({
      providerConfigs: {},
      customProviders: [makeCustomProvider({ name: 'Local LLM', slug: 'local-llm' })],
      tones: [],
      systemPromptTemplates: [],
    });
    render(<VoiceSelector onSelect={vi.fn()} />);
    expect(screen.getByText('Local LLM')).toBeTruthy();
    expect(screen.queryByText(/Enable providers in/)).toBeNull();
  });

  it('shows multiple custom providers', () => {
    useSettingsStore.setState({
      providerConfigs: {},
      customProviders: [
        makeCustomProvider({ id: 'cp-1', name: 'Ollama', slug: 'ollama' }),
        makeCustomProvider({ id: 'cp-2', name: 'vLLM', slug: 'vllm' }),
      ],
      tones: [],
      systemPromptTemplates: [],
    });
    render(<VoiceSelector onSelect={vi.fn()} />);
    expect(screen.getByText('Ollama')).toBeTruthy();
    expect(screen.getByText('vLLM')).toBeTruthy();
  });

  it('does not show template selector when no templates exist', () => {
    useSettingsStore.setState({
      providerConfigs: makeProviderConfigs([{ provider: 'anthropic', voiceType: 'api' }]),
      customProviders: [],
      tones: [],
      systemPromptTemplates: [],
    });
    render(<VoiceSelector onSelect={vi.fn()} />);
    expect(screen.queryByText('System prompt template')).toBeNull();
  });

  it('renders with templates in store without crashing', () => {
    useSettingsStore.setState({
      providerConfigs: makeProviderConfigs([{ provider: 'anthropic', voiceType: 'api' }]),
      customProviders: [],
      tones: [],
      systemPromptTemplates: [
        { id: 'tmpl-1', name: 'Code Review', content: 'Review code carefully.', createdAt: 1000, updatedAt: 1000 },
      ],
    });
    render(<VoiceSelector onSelect={vi.fn()} />);
    expect(screen.getByText('Anthropic')).toBeTruthy();
  });

  describe('provider availability (VoiceSelector disabled states)', () => {
    it('provider button is enabled and selectable when API key is available', () => {
      useSettingsStore.setState({
        providerConfigs: makeProviderConfigs([{ provider: 'anthropic', voiceType: 'api' }]),
        providerStatuses: { anthropic: makeProviderStatus('anthropic', 'specific') },
        cliTestStates: {},
        customProviders: [],
        tones: [],
        systemPromptTemplates: [],
      });
      render(<VoiceSelector onSelect={vi.fn()} />);
      const btn = screen.getByRole('button', { name: /Select anthropic provider/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    it('provider button is disabled when API key is missing and CLI is not found', () => {
      useSettingsStore.setState({
        providerConfigs: makeProviderConfigs([{ provider: 'anthropic', voiceType: 'api' }]),
        providerStatuses: { anthropic: makeProviderStatus('anthropic', 'none') },
        cliTestStates: { anthropic: { status: 'error', result: { success: false, error: 'not found' } } },
        customProviders: [],
        tones: [],
        systemPromptTemplates: [],
      });
      render(<VoiceSelector onSelect={vi.fn()} />);
      const btn = screen.getByRole('button', { name: /Select anthropic provider/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('shows type toggle with both options when both API and CLI are enabled', () => {
      useSettingsStore.setState({
        providerConfigs: makeProviderConfigs([
          { provider: 'anthropic', voiceType: 'api' },
          { provider: 'anthropic', voiceType: 'cli', overrides: { cliCommand: 'claude' } },
        ]),
        providerStatuses: { anthropic: makeProviderStatus('anthropic', 'specific') },
        cliTestStates: { anthropic: { status: 'success', result: { success: true, path: '/usr/bin/claude' } } },
        customProviders: [],
        tones: [],
        systemPromptTemplates: [],
      });
      render(<VoiceSelector onSelect={vi.fn()} />);
      const providerBtn = screen.getByRole('button', { name: /Select anthropic provider/i }) as HTMLButtonElement;
      expect(providerBtn.disabled).toBe(false);

      fireEvent.click(providerBtn);

      const apiToggle = screen.getByRole('button', { name: /^api$/i }) as HTMLButtonElement;
      const cliToggle = screen.getByRole('button', { name: /^cli$/i }) as HTMLButtonElement;
      expect(apiToggle.disabled).toBe(false);
      expect(cliToggle.disabled).toBe(false);
    });

    it('hides type toggle when only one type is enabled', () => {
      useSettingsStore.setState({
        providerConfigs: makeProviderConfigs([
          { provider: 'anthropic', voiceType: 'api' },
        ]),
        providerStatuses: { anthropic: makeProviderStatus('anthropic', 'specific') },
        cliTestStates: {},
        customProviders: [],
        tones: [],
        systemPromptTemplates: [],
      });
      render(<VoiceSelector onSelect={vi.fn()} />);
      const providerBtn = screen.getByRole('button', { name: /Select anthropic provider/i }) as HTMLButtonElement;
      fireEvent.click(providerBtn);

      expect(screen.queryByRole('button', { name: /^api$/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /^cli$/i })).toBeNull();
    });
  });

  describe('custom provider payload', () => {
    it('selecting a custom provider and clicking Add Voice emits provider: openai-compat', () => {
      const cp = makeCustomProvider({ id: 'cp-1', name: 'Ollama', slug: 'ollama', defaultModel: 'llama3.2' });
      useSettingsStore.setState({
        providerConfigs: {},
        customProviders: [cp],
        tones: [],
        systemPromptTemplates: [],
      });
      const onSelect = vi.fn();
      render(<VoiceSelector onSelect={onSelect} />);

      fireEvent.click(screen.getByRole('button', { name: /Select Ollama provider/i }));
      fireEvent.click(screen.getByRole('button', { name: /Add Voice/i }));

      expect(onSelect).toHaveBeenCalledOnce();
      const payload = onSelect.mock.calls[0]![0];
      expect(payload.provider).toBe('openai-compat');
      expect(payload.customProviderId).toBe('cp-1');
    });

    it('custom provider selection uses the provider defaultModel when set', () => {
      const cp = makeCustomProvider({ id: 'cp-1', name: 'Ollama', slug: 'ollama', defaultModel: 'llama3.2' });
      useSettingsStore.setState({
        providerConfigs: {},
        customProviders: [cp],
        tones: [],
        systemPromptTemplates: [],
      });
      const onSelect = vi.fn();
      render(<VoiceSelector onSelect={onSelect} />);

      fireEvent.click(screen.getByRole('button', { name: /Select Ollama provider/i }));
      fireEvent.click(screen.getByRole('button', { name: /Add Voice/i }));

      const payload = onSelect.mock.calls[0]![0];
      expect(payload.model).toBe('llama3.2');
    });

    it('custom provider without defaultModel emits undefined model', () => {
      const cp = makeCustomProvider({ id: 'cp-2', name: 'vLLM', slug: 'vllm', defaultModel: null });
      useSettingsStore.setState({
        providerConfigs: {},
        customProviders: [cp],
        tones: [],
        systemPromptTemplates: [],
      });
      const onSelect = vi.fn();
      render(<VoiceSelector onSelect={onSelect} />);

      fireEvent.click(screen.getByRole('button', { name: /Select vLLM provider/i }));
      fireEvent.click(screen.getByRole('button', { name: /Add Voice/i }));

      const payload = onSelect.mock.calls[0]![0];
      expect(payload.model).toBeUndefined();
    });
  });

  describe('built-in provider selection payload', () => {
    it('selecting a built-in provider and clicking Add Voice emits correct provider key', () => {
      useSettingsStore.setState({
        providerConfigs: makeProviderConfigs([
          { provider: 'openai', voiceType: 'api', overrides: { defaultModel: 'gpt-4o' } },
        ]),
        providerStatuses: { openai: makeProviderStatus('openai', 'specific') },
        cliTestStates: {},
        customProviders: [],
        tones: [],
        systemPromptTemplates: [],
        modelFetchStates: {},
      });
      const onSelect = vi.fn();
      render(<VoiceSelector onSelect={onSelect} />);

      fireEvent.click(screen.getByRole('button', { name: /Select openai provider/i }));
      fireEvent.click(screen.getByRole('button', { name: /Add Voice/i }));

      expect(onSelect).toHaveBeenCalledOnce();
      const payload = onSelect.mock.calls[0]![0];
      expect(payload.provider).toBe('openai');
    });
  });

  describe('model selection', () => {
    it('available models from modelFetchStates are shown in the model selector', () => {
      useSettingsStore.setState({
        providerConfigs: makeProviderConfigs([
          { provider: 'openai', voiceType: 'api', overrides: { defaultModel: 'gpt-4o' } },
        ]),
        providerStatuses: { openai: makeProviderStatus('openai', 'specific') },
        cliTestStates: {},
        customProviders: [],
        tones: [],
        systemPromptTemplates: [],
        modelFetchStates: { openai: { status: 'done', models: ['gpt-4o', 'gpt-4o-mini'] } },
      });
      render(<VoiceSelector onSelect={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: /Select openai provider/i }));

      // The model selector is the first combobox rendered in the config form
      const comboboxes = screen.getAllByRole('combobox') as HTMLSelectElement[];
      const modelSelect = comboboxes.find((s) =>
        Array.from(s.options).some((o) => o.value === 'gpt-4o'),
      )!;
      const options = Array.from(modelSelect.options).map((o) => o.value);
      expect(options).toContain('gpt-4o');
      expect(options).toContain('gpt-4o-mini');
    });

    it('changing model selection updates the value shown', () => {
      useSettingsStore.setState({
        providerConfigs: makeProviderConfigs([
          { provider: 'openai', voiceType: 'api', overrides: { defaultModel: 'gpt-4o' } },
        ]),
        providerStatuses: { openai: makeProviderStatus('openai', 'specific') },
        cliTestStates: {},
        customProviders: [],
        tones: [],
        systemPromptTemplates: [],
        modelFetchStates: { openai: { status: 'done', models: ['gpt-4o', 'gpt-4o-mini'] } },
      });
      render(<VoiceSelector onSelect={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: /Select openai provider/i }));

      const comboboxes = screen.getAllByRole('combobox') as HTMLSelectElement[];
      const modelSelect = comboboxes.find((s) =>
        Array.from(s.options).some((o) => o.value === 'gpt-4o'),
      )!;
      fireEvent.change(modelSelect, { target: { value: 'gpt-4o-mini' } });
      expect(modelSelect.value).toBe('gpt-4o-mini');
    });
  });

  describe('color exclusion', () => {
    it('all color swatches are enabled when no colors are excluded', () => {
      useSettingsStore.setState({
        providerConfigs: makeProviderConfigs([{ provider: 'openai', voiceType: 'api' }]),
        providerStatuses: { openai: makeProviderStatus('openai', 'specific') },
        cliTestStates: {},
        customProviders: [],
        tones: [],
        systemPromptTemplates: [],
        userProfile: makeProfile({ conductorColor: '' }),
      });
      render(<VoiceSelector onSelect={vi.fn()} voices={[]} />);
      fireEvent.click(screen.getByRole('button', { name: /Select openai provider/i }));

      const inUseSwatches = screen.queryAllByRole('button', { name: /already in use/i });
      expect(inUseSwatches).toHaveLength(0);
    });

    it('conductor color swatch is disabled in the voice color picker', () => {
      useSettingsStore.setState({
        providerConfigs: makeProviderConfigs([{ provider: 'openai', voiceType: 'api' }]),
        providerStatuses: { openai: makeProviderStatus('openai', 'specific') },
        cliTestStates: {},
        customProviders: [],
        tones: [],
        systemPromptTemplates: [],
        userProfile: makeProfile({ conductorColor: '#6366f1' }), // indigo
      });
      render(<VoiceSelector onSelect={vi.fn()} voices={[]} />);
      fireEvent.click(screen.getByRole('button', { name: /Select openai provider/i }));

      const indigoBtn = screen.getByRole('button', { name: /Voice color: indigo \(already in use\)/i }) as HTMLButtonElement;
      expect(indigoBtn.disabled).toBe(true);
    });

    it('conductor color swatch is disabled for custom providers too', () => {
      const cp = makeCustomProvider({ id: 'cp-1', name: 'Ollama', slug: 'ollama' });
      useSettingsStore.setState({
        providerConfigs: {},
        customProviders: [cp],
        tones: [],
        systemPromptTemplates: [],
        userProfile: makeProfile({ conductorColor: '#ec4899' }), // pink
      });
      render(<VoiceSelector onSelect={vi.fn()} voices={[]} />);
      fireEvent.click(screen.getByRole('button', { name: /Select Ollama provider/i }));

      const pinkBtn = screen.getByRole('button', { name: /Voice color: pink \(already in use\)/i }) as HTMLButtonElement;
      expect(pinkBtn.disabled).toBe(true);
    });

    it('existing voice color in the composition is disabled in the picker', () => {
      useSettingsStore.setState({
        providerConfigs: makeProviderConfigs([{ provider: 'openai', voiceType: 'api' }]),
        providerStatuses: { openai: makeProviderStatus('openai', 'specific') },
        cliTestStates: {},
        customProviders: [],
        tones: [],
        systemPromptTemplates: [],
        userProfile: makeProfile({ conductorColor: '' }),
      });
      const existingVoice = {
        id: 'v1',
        compositionId: '',
        provider: 'anthropic',
        displayName: 'Alice',
        color: '#10b981', // green
        avatarIcon: 'anthropic',
        order: 0,
      };
      render(<VoiceSelector onSelect={vi.fn()} voices={[existingVoice]} />);
      fireEvent.click(screen.getByRole('button', { name: /Select openai provider/i }));

      const greenBtn = screen.getByRole('button', { name: /Voice color: green \(already in use\)/i }) as HTMLButtonElement;
      expect(greenBtn.disabled).toBe(true);
    });

    it('multiple existing voice colors and conductor color are all disabled', () => {
      useSettingsStore.setState({
        providerConfigs: makeProviderConfigs([{ provider: 'openai', voiceType: 'api' }]),
        providerStatuses: { openai: makeProviderStatus('openai', 'specific') },
        cliTestStates: {},
        customProviders: [],
        tones: [],
        systemPromptTemplates: [],
        userProfile: makeProfile({ conductorColor: '#6366f1' }), // indigo
      });
      const voices = [
        { id: 'v1', compositionId: '', provider: 'anthropic', displayName: 'Alice', color: '#ec4899', avatarIcon: 'anthropic', order: 0 }, // pink
        { id: 'v2', compositionId: '', provider: 'gemini', displayName: 'Bob', color: '#10b981', avatarIcon: 'gemini', order: 1 },    // green
      ];
      render(<VoiceSelector onSelect={vi.fn()} voices={voices} />);
      fireEvent.click(screen.getByRole('button', { name: /Select openai provider/i }));

      const indigoBtn = screen.getByRole('button', { name: /Voice color: indigo \(already in use\)/i }) as HTMLButtonElement;
      const pinkBtn = screen.getByRole('button', { name: /Voice color: pink \(already in use\)/i }) as HTMLButtonElement;
      const greenBtn = screen.getByRole('button', { name: /Voice color: green \(already in use\)/i }) as HTMLButtonElement;
      expect(indigoBtn.disabled).toBe(true);
      expect(pinkBtn.disabled).toBe(true);
      expect(greenBtn.disabled).toBe(true);

      // amber, blue, red should still be available
      const amberBtn = screen.getByRole('button', { name: /^Voice color: amber$/i }) as HTMLButtonElement;
      expect(amberBtn.disabled).toBe(false);
    });

    it('auto-selects first available color when opening provider if default is excluded', () => {
      // indigo (#6366f1) is the first preset and the conductor color — should be skipped
      // OpenAI's metadata color is #10A37F which is NOT in PRESET_COLORS, so it should be used as-is
      // but let's use a provider whose metadata color IS excluded
      useSettingsStore.setState({
        providerConfigs: makeProviderConfigs([{ provider: 'openai', voiceType: 'api' }]),
        providerStatuses: { openai: makeProviderStatus('openai', 'specific') },
        cliTestStates: {},
        customProviders: [],
        tones: [],
        systemPromptTemplates: [],
        userProfile: makeProfile({ conductorColor: '#6366f1' }), // indigo — first preset
      });
      const onSelect = vi.fn();
      // Pass indigo as an existing voice color too, so the first available preset is pink
      const voices = [
        { id: 'v1', compositionId: '', provider: 'anthropic', displayName: 'Alice', color: '#6366f1', avatarIcon: 'anthropic', order: 0 },
      ];
      render(<VoiceSelector onSelect={onSelect} voices={voices} />);

      // Open a custom provider so the default color starts as first PRESET_COLORS entry
      const cp = makeCustomProvider({ id: 'cp-1', name: 'Ollama', slug: 'ollama' });
      useSettingsStore.setState({ customProviders: [cp] });
      cleanup();
      render(<VoiceSelector onSelect={onSelect} voices={voices} />);
      fireEvent.click(screen.getByRole('button', { name: /Select Ollama provider/i }));
      fireEvent.click(screen.getByRole('button', { name: /Add Voice/i }));

      const payload = onSelect.mock.calls[0]![0];
      expect(payload.color).not.toBe('#6366f1'); // must not be the excluded indigo
    });

    it('clicking a disabled color swatch does not change the selected color', () => {
      useSettingsStore.setState({
        providerConfigs: makeProviderConfigs([{ provider: 'openai', voiceType: 'api' }]),
        providerStatuses: { openai: makeProviderStatus('openai', 'specific') },
        cliTestStates: {},
        customProviders: [],
        tones: [],
        systemPromptTemplates: [],
        userProfile: makeProfile({ conductorColor: '#6366f1' }), // indigo excluded
      });
      const onSelect = vi.fn();
      render(<VoiceSelector onSelect={onSelect} voices={[]} />);
      fireEvent.click(screen.getByRole('button', { name: /Select openai provider/i }));

      // Try clicking the disabled indigo swatch
      const indigoBtn = screen.getByRole('button', { name: /Voice color: indigo \(already in use\)/i });
      fireEvent.click(indigoBtn);

      // Add voice — payload should not use indigo (the disabled color)
      fireEvent.click(screen.getByRole('button', { name: /Add Voice/i }));
      const payload = onSelect.mock.calls[0]![0];
      expect(payload.color).not.toBe('#6366f1');
    });
  });
});
