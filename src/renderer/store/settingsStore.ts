import { create } from 'zustand';
import type {
  ProviderConfig,
  ProviderStatus,
  CliTestResult,
  UserProfile,
  CustomProvider,
  CustomProviderWithStatus,
  ToneDefinition,
  SystemPromptTemplate,
} from '../../shared/types';
import { SETTINGS_PROVIDERS, PROVIDER_METADATA, type VoiceType } from '../../shared/constants';

interface CliTestState {
  status: 'idle' | 'testing' | 'success' | 'error';
  result?: CliTestResult;
}

interface ModelFetchState {
  status: 'idle' | 'fetching' | 'done' | 'error';
  models: string[];
  error?: string;
}

// Configs keyed by provider then voice type: providerConfigs['anthropic']['api']
export type ProviderConfigsByType = Record<string, Partial<Record<VoiceType, ProviderConfig>>>;

interface SettingsState {
  providerStatuses: Record<string, ProviderStatus>;
  providerConfigs: ProviderConfigsByType;
  cliTestStates: Record<string, CliTestState>;
  modelFetchStates: Record<string, ModelFetchState>;
  saveConfirmation: string | null;
  loading: boolean;
  error: string | null;
  userProfile: UserProfile;
  profileSaved: boolean;
  pendingAvatarSrc: string | null;
  customProviders: CustomProviderWithStatus[];
  customProviderModelFetchStates: Record<string, ModelFetchState>;
  tones: ToneDefinition[];
  systemPromptTemplates: SystemPromptTemplate[];
}

interface SettingsActions {
  load: () => Promise<void>;
  saveConfig: (config: Omit<ProviderConfig, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  /** Returns the config for a specific provider+type, or null if not yet saved. */
  getConfig: (provider: string, voiceType: VoiceType) => ProviderConfig | null;
  testCli: (provider: string, command: string) => Promise<void>;
  clearCliTest: (provider: string) => void;
  fetchModels: (provider: string) => Promise<void>;
  saveUserProfile: (profile: Omit<UserProfile, 'updatedAt'>) => Promise<void>;
  uploadConductorAvatar: () => Promise<void>;
  pickAvatarFile: () => Promise<void>;
  confirmAvatar: (dataUrl: string) => Promise<void>;
  dismissPendingAvatar: () => void;
  loadCustomProviders: () => Promise<void>;
  createCustomProvider: (
    data: Omit<CustomProvider, 'id' | 'deleted' | 'createdAt' | 'updatedAt'>,
  ) => Promise<CustomProviderWithStatus>;
  updateCustomProvider: (
    id: string,
    data: Partial<Omit<CustomProvider, 'id' | 'slug' | 'deleted' | 'createdAt' | 'updatedAt'>>,
  ) => Promise<void>;
  deleteCustomProvider: (id: string) => Promise<void>;
  fetchCustomProviderModels: (customProviderId: string) => Promise<void>;
  loadTones: () => Promise<void>;
  createTone: (data: Pick<ToneDefinition, 'name' | 'description'>) => Promise<ToneDefinition>;
  updateTone: (id: string, data: Partial<Pick<ToneDefinition, 'name' | 'description'>>) => Promise<void>;
  deleteTone: (id: string) => Promise<void>;
  loadSystemPromptTemplates: () => Promise<void>;
  createSystemPromptTemplate: (data: Pick<SystemPromptTemplate, 'name' | 'content'>) => Promise<SystemPromptTemplate>;
  updateSystemPromptTemplate: (id: string, data: Partial<Pick<SystemPromptTemplate, 'name' | 'content'>>) => Promise<void>;
  deleteSystemPromptTemplate: (id: string) => Promise<void>;
}

function defaultConfigForProviderType(provider: string, voiceType: VoiceType): Omit<ProviderConfig, 'id' | 'createdAt' | 'updatedAt'> {
  const meta = PROVIDER_METADATA[provider];
  return {
    provider,
    voiceType,
    enabled: false,
    defaultModel: voiceType === 'api' ? (meta?.defaultModels[0] ?? null) : null,
    cliCommand: voiceType === 'cli' ? (meta?.defaultCliCommand ?? null) : null,
    cliArgs: null,
    yoloMode: false,
  };
}

const DEFAULT_PROFILE: UserProfile = {
  conductorName: '',
  pronouns: '',
  conductorContext: '',
  defaultTone: 'collaborative',
  conductorColor: '',
  conductorAvatar: '',
  preferMarkdown: true,
  updatedAt: 0,
};

export const useSettingsStore = create<SettingsState & SettingsActions>((set, get) => ({
  providerStatuses: {},
  providerConfigs: {},
  cliTestStates: {},
  modelFetchStates: {},
  saveConfirmation: null,
  loading: false,
  error: null,
  userProfile: DEFAULT_PROFILE,
  profileSaved: false,
  pendingAvatarSrc: null,
  customProviders: [],
  customProviderModelFetchStates: {},
  tones: [],
  systemPromptTemplates: [],

  load: async () => {
    set({ loading: true, error: null });
    try {
      const [statuses, configs, profile, customProviders, tones, systemPromptTemplates] = await Promise.all([
        window.polyphon.settings.getProviderStatus(),
        window.polyphon.settings.getProviderConfig(),
        window.polyphon.settings.getUserProfile(),
        window.polyphon.settings.listCustomProviders(),
        window.polyphon.settings.listTones(),
        window.polyphon.settings.listSystemPromptTemplates(),
      ]);

      const statusMap: Record<string, ProviderStatus> = {};
      for (const s of statuses) statusMap[s.provider] = s;

      // Build nested map: provider → voiceType → config
      const configMap: ProviderConfigsByType = {};
      for (const c of configs) {
        if (!configMap[c.provider]) configMap[c.provider] = {};
        configMap[c.provider]![c.voiceType] = c;
      }

      // Ensure every settings provider has a default entry for each supported type
      for (const provider of SETTINGS_PROVIDERS) {
        const meta = PROVIDER_METADATA[provider];
        if (!meta) continue;
        if (!configMap[provider]) configMap[provider] = {};
        for (const voiceType of meta.supportedTypes) {
          if (!configMap[provider]![voiceType]) {
            configMap[provider]![voiceType] = {
              id: '',
              createdAt: 0,
              updatedAt: 0,
              ...defaultConfigForProviderType(provider, voiceType),
            };
          }
        }
      }

      set({ providerStatuses: statusMap, providerConfigs: configMap, userProfile: profile, customProviders, tones, systemPromptTemplates, loading: false });

      // Boot-time CLI probe — fired in parallel, does not block app startup
      void Promise.all(
        Object.entries(PROVIDER_METADATA)
          .filter(([, meta]) => meta.defaultCliCommand !== null)
          .map(([provider, meta]) => get().testCli(provider, meta.defaultCliCommand!))
      );

      // Auto-fetch models for enabled API providers that have a key
      for (const provider of SETTINGS_PROVIDERS) {
        const apiConfig = configMap[provider]?.api;
        const status = statusMap[provider];
        if (apiConfig?.enabled && status?.apiKeyStatus.status !== 'none') {
          get().fetchModels(provider);
        }
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false });
    }
  },

  saveConfig: async (config) => {
    try {
      const saved = await window.polyphon.settings.saveProviderConfig(config);
      set((s) => ({
        providerConfigs: {
          ...s.providerConfigs,
          [saved.provider]: {
            ...s.providerConfigs[saved.provider],
            [saved.voiceType]: saved,
          },
        },
        saveConfirmation: saved.provider,
      }));
      setTimeout(() => {
        if (get().saveConfirmation === saved.provider) {
          set({ saveConfirmation: null });
        }
      }, 2000);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  getConfig: (provider, voiceType) => {
    return get().providerConfigs[provider]?.[voiceType] ?? null;
  },

  testCli: async (provider, command) => {
    set((s) => ({
      cliTestStates: { ...s.cliTestStates, [provider]: { status: 'testing' } },
    }));
    try {
      const result = await window.polyphon.settings.testCliVoice(command);
      set((s) => ({
        cliTestStates: {
          ...s.cliTestStates,
          [provider]: { status: result.success ? 'success' : 'error', result },
        },
      }));
    } catch (err) {
      set((s) => ({
        cliTestStates: {
          ...s.cliTestStates,
          [provider]: {
            status: 'error',
            result: { success: false, error: err instanceof Error ? err.message : String(err) },
          },
        },
      }));
    }
  },

  clearCliTest: (provider) => {
    set((s) => {
      const next = { ...s.cliTestStates };
      delete next[provider];
      return { cliTestStates: next };
    });
  },

  fetchModels: async (provider) => {
    set((s) => ({
      modelFetchStates: {
        ...s.modelFetchStates,
        [provider]: { status: 'fetching', models: [] },
      },
    }));
    try {
      const result = await window.polyphon.settings.fetchModels(provider);
      set((s) => ({
        modelFetchStates: {
          ...s.modelFetchStates,
          [provider]: result.error
            ? { status: 'error', models: [], error: result.error }
            : { status: 'done', models: result.models },
        },
      }));
    } catch (err) {
      set((s) => ({
        modelFetchStates: {
          ...s.modelFetchStates,
          [provider]: {
            status: 'error',
            models: [],
            error: err instanceof Error ? err.message : String(err),
          },
        },
      }));
    }
  },

  saveUserProfile: async (profile) => {
    try {
      const saved = await window.polyphon.settings.saveUserProfile(profile);
      set({ userProfile: saved, profileSaved: true });
      setTimeout(() => {
        if (get().profileSaved) set({ profileSaved: false });
      }, 2000);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  uploadConductorAvatar: async () => {
    try {
      const dataUrl = await window.polyphon.settings.uploadConductorAvatar();
      if (dataUrl) {
        set((s) => ({ userProfile: { ...s.userProfile, conductorAvatar: dataUrl } }));
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  pickAvatarFile: async () => {
    try {
      const dataUrl = await window.polyphon.settings.pickAvatarFile();
      if (dataUrl) set({ pendingAvatarSrc: dataUrl });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  confirmAvatar: async (dataUrl) => {
    const { userProfile } = get();
    try {
      const saved = await window.polyphon.settings.saveUserProfile({ ...userProfile, conductorAvatar: dataUrl });
      set({ userProfile: saved, pendingAvatarSrc: null });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  dismissPendingAvatar: () => set({ pendingAvatarSrc: null }),

  loadCustomProviders: async () => {
    try {
      const customProviders = await window.polyphon.settings.listCustomProviders();
      set({ customProviders });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  createCustomProvider: async (data) => {
    const cp = await window.polyphon.settings.createCustomProvider(data);
    set((s) => ({ customProviders: [...s.customProviders, cp] }));
    return cp;
  },

  updateCustomProvider: async (id, data) => {
    const cp = await window.polyphon.settings.updateCustomProvider(id, data);
    set((s) => ({
      customProviders: s.customProviders.map((p) => (p.id === id ? cp : p)),
    }));
  },

  deleteCustomProvider: async (id) => {
    await window.polyphon.settings.deleteCustomProvider(id);
    set((s) => ({ customProviders: s.customProviders.filter((p) => p.id !== id) }));
  },

  loadTones: async () => {
    try {
      const tones = await window.polyphon.settings.listTones();
      set({ tones });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  createTone: async (data) => {
    const tone = await window.polyphon.settings.createTone(data);
    set((s) => ({ tones: [...s.tones, tone] }));
    return tone;
  },

  updateTone: async (id, data) => {
    const tone = await window.polyphon.settings.updateTone(id, data);
    set((s) => ({ tones: s.tones.map((t) => (t.id === id ? tone : t)) }));
  },

  deleteTone: async (id) => {
    await window.polyphon.settings.deleteTone(id);
    set((s) => ({ tones: s.tones.filter((t) => t.id !== id) }));
  },

  loadSystemPromptTemplates: async () => {
    try {
      const systemPromptTemplates = await window.polyphon.settings.listSystemPromptTemplates();
      set({ systemPromptTemplates });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  createSystemPromptTemplate: async (data) => {
    const template = await window.polyphon.settings.createSystemPromptTemplate(data);
    set((s) => ({ systemPromptTemplates: [...s.systemPromptTemplates, template] }));
    return template;
  },

  updateSystemPromptTemplate: async (id, data) => {
    const template = await window.polyphon.settings.updateSystemPromptTemplate(id, data);
    set((s) => ({ systemPromptTemplates: s.systemPromptTemplates.map((t) => (t.id === id ? template : t)) }));
  },

  deleteSystemPromptTemplate: async (id) => {
    await window.polyphon.settings.deleteSystemPromptTemplate(id);
    set((s) => ({ systemPromptTemplates: s.systemPromptTemplates.filter((t) => t.id !== id) }));
  },

  fetchCustomProviderModels: async (customProviderId) => {
    set((s) => ({
      customProviderModelFetchStates: {
        ...s.customProviderModelFetchStates,
        [customProviderId]: { status: 'fetching', models: [] },
      },
    }));
    try {
      const result = await window.polyphon.settings.fetchCustomProviderModels(customProviderId);
      set((s) => ({
        customProviderModelFetchStates: {
          ...s.customProviderModelFetchStates,
          [customProviderId]: result.error
            ? { status: 'error', models: [], error: result.error }
            : { status: 'done', models: result.models },
        },
      }));
    } catch (err) {
      set((s) => ({
        customProviderModelFetchStates: {
          ...s.customProviderModelFetchStates,
          [customProviderId]: {
            status: 'error',
            models: [],
            error: err instanceof Error ? err.message : String(err),
          },
        },
      }));
    }
  },
}));
