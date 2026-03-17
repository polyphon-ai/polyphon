import { contextBridge, ipcRenderer } from 'electron';
import type {
  Composition,
  CompositionVoice,
  Session,
  Message,
  ProviderConfig,
  ProviderStatus,
  CliTestResult,
  ModelsResult,
  UserProfile,
  CustomProvider,
  CustomProviderWithStatus,
  ToneDefinition,
  SystemPromptTemplate,
  UpdateInfo,
  EncryptionStatus,
} from '../shared/types';
import type { ProbeModelResult } from './ipc/settingsHandlers';
import { IPC } from '../shared/constants';

// All renderer-accessible APIs are explicitly listed here.
// The main process never exposes the full ipcRenderer to the renderer.
const api = {
  composition: {
    create: (data: Omit<Composition, 'id' | 'createdAt' | 'updatedAt'>) =>
      ipcRenderer.invoke(IPC.COMPOSITION_CREATE, data),
    list: (archived = false): Promise<Composition[]> =>
      ipcRenderer.invoke(IPC.COMPOSITION_LIST, archived),
    get: (id: string): Promise<Composition | null> =>
      ipcRenderer.invoke(IPC.COMPOSITION_GET, id),
    update: (id: string, data: Partial<Composition>) =>
      ipcRenderer.invoke(IPC.COMPOSITION_UPDATE, id, data),
    delete: (id: string) => ipcRenderer.invoke(IPC.COMPOSITION_DELETE, id),
    archive: (id: string, archived: boolean) =>
      ipcRenderer.invoke(IPC.COMPOSITION_ARCHIVE, id, archived),
  },

  session: {
    create: (compositionId: string, name: string): Promise<Session> =>
      ipcRenderer.invoke(IPC.SESSION_CREATE, compositionId, name),
    list: (archived = false): Promise<Session[]> =>
      ipcRenderer.invoke(IPC.SESSION_LIST, archived),
    get: (id: string): Promise<Session | null> =>
      ipcRenderer.invoke(IPC.SESSION_GET, id),
    rename: (id: string, name: string): Promise<Session | null> =>
      ipcRenderer.invoke(IPC.SESSION_RENAME, id, name),
    delete: (id: string) => ipcRenderer.invoke(IPC.SESSION_DELETE, id),
    archive: (id: string, archived: boolean) =>
      ipcRenderer.invoke(IPC.SESSION_ARCHIVE, id, archived),
    listMessages: (sessionId: string): Promise<Message[]> =>
      ipcRenderer.invoke(IPC.SESSION_MESSAGES_LIST, sessionId),
    onContinuationPrompt: (
      sessionId: string,
      handler: (payload: { roundIndex: number; voiceResponses: Message[] }) => void,
    ) => {
      const channel = `${IPC.SESSION_CONTINUATION_PROMPT}:${sessionId}`;
      const listener = (
        _: Electron.IpcRendererEvent,
        payload: { roundIndex: number; voiceResponses: Message[] },
      ) => handler(payload);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.off(channel, listener);
    },
    onNoTarget: (
      sessionId: string,
      handler: (payload: { voiceNames: string[] }) => void,
    ) => {
      const channel = `${IPC.SESSION_NO_TARGET}:${sessionId}`;
      const listener = (
        _: Electron.IpcRendererEvent,
        payload: { voiceNames: string[] },
      ) => handler(payload);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.off(channel, listener);
    },
  },

  voice: {
    send: (sessionId: string, message: Message) =>
      ipcRenderer.invoke(IPC.VOICE_SEND, sessionId, message),
    abort: (sessionId: string) =>
      ipcRenderer.invoke(IPC.VOICE_ABORT, sessionId),
    onPending: (sessionId: string, handler: (voiceId: string) => void) => {
      const channel = `${IPC.VOICE_PENDING}:${sessionId}`;
      const listener = (
        _: Electron.IpcRendererEvent,
        payload: { voiceId: string },
      ) => handler(payload.voiceId);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.off(channel, listener);
    },
    onToken: (
      sessionId: string,
      handler: (voiceId: string, token: string) => void,
    ) => {
      const channel = `${IPC.VOICE_TOKEN}:${sessionId}`;
      const listener = (
        _: Electron.IpcRendererEvent,
        payload: { voiceId: string; token: string },
      ) => handler(payload.voiceId, payload.token);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.off(channel, listener);
    },
    onDone: (sessionId: string, handler: (voiceId: string) => void) => {
      const channel = `${IPC.VOICE_DONE}:${sessionId}`;
      const listener = (
        _: Electron.IpcRendererEvent,
        payload: { voiceId: string },
      ) => handler(payload.voiceId);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.off(channel, listener);
    },
    onError: (
      sessionId: string,
      handler: (voiceId: string, error: string) => void,
    ) => {
      const channel = `${IPC.VOICE_ERROR}:${sessionId}`;
      const listener = (
        _: Electron.IpcRendererEvent,
        payload: { voiceId: string; error: string },
      ) => handler(payload.voiceId, payload.error);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.off(channel, listener);
    },
  },

  shell: {
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke(IPC.SHELL_OPEN_EXTERNAL, url),
  },

  update: {
    getState: (): Promise<UpdateInfo | null> =>
      ipcRenderer.invoke(IPC.UPDATE_GET_STATE),
    dismiss: (version: string, permanently: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.UPDATE_DISMISS, version, permanently),
    checkNow: (): Promise<UpdateInfo | null> =>
      ipcRenderer.invoke(IPC.UPDATE_CHECK_NOW),
    onAvailable: (handler: (info: UpdateInfo) => void) => {
      const listener = (_: Electron.IpcRendererEvent, info: UpdateInfo) => handler(info);
      ipcRenderer.on(IPC.UPDATE_AVAILABLE, listener);
      return () => ipcRenderer.off(IPC.UPDATE_AVAILABLE, listener);
    },
  },

  encryption: {
    getStatus: (): Promise<EncryptionStatus> =>
      ipcRenderer.invoke(IPC.ENCRYPTION_GET_STATUS),
    setPassword: (newPassword: string): Promise<void> =>
      ipcRenderer.invoke(IPC.ENCRYPTION_SET_PASSWORD, newPassword),
    changePassword: (oldPassword: string, newPassword: string): Promise<void> =>
      ipcRenderer.invoke(IPC.ENCRYPTION_CHANGE_PASSWORD, oldPassword, newPassword),
    removePassword: (currentPassword: string): Promise<void> =>
      ipcRenderer.invoke(IPC.ENCRYPTION_REMOVE_PASSWORD, currentPassword),
    dismissLinuxNotice: (): Promise<void> =>
      ipcRenderer.invoke(IPC.ENCRYPTION_DISMISS_LINUX_NOTICE),
    unlockAttempt: (password: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.ENCRYPTION_UNLOCK_ATTEMPT, password),
    onLinuxNotice: (handler: () => void) => {
      const listener = () => handler();
      ipcRenderer.on(IPC.ENCRYPTION_LINUX_NOTICE, listener);
      return () => ipcRenderer.off(IPC.ENCRYPTION_LINUX_NOTICE, listener);
    },
    onKeyRegeneratedWarning: (handler: () => void) => {
      const listener = () => handler();
      ipcRenderer.on(IPC.ENCRYPTION_KEY_REGENERATED_WARNING, listener);
      return () => ipcRenderer.off(IPC.ENCRYPTION_KEY_REGENERATED_WARNING, listener);
    },
  },

  settings: {
    getProviderStatus: (): Promise<ProviderStatus[]> =>
      ipcRenderer.invoke(IPC.SETTINGS_GET_PROVIDER_STATUS),
    testCliVoice: (command: string): Promise<CliTestResult> =>
      ipcRenderer.invoke(IPC.SETTINGS_TEST_CLI_VOICE, command),
    saveProviderConfig: (
      config: Omit<ProviderConfig, 'id' | 'createdAt' | 'updatedAt'>,
    ): Promise<ProviderConfig> =>
      ipcRenderer.invoke(IPC.SETTINGS_SAVE_PROVIDER_CONFIG, config),
    getProviderConfig: (): Promise<ProviderConfig[]> =>
      ipcRenderer.invoke(IPC.SETTINGS_GET_PROVIDER_CONFIG),
    fetchModels: (provider: string): Promise<ModelsResult> =>
      ipcRenderer.invoke(IPC.SETTINGS_FETCH_MODELS, provider),
    probeModel: (provider: string, model: string): Promise<ProbeModelResult> =>
      ipcRenderer.invoke(IPC.SETTINGS_PROBE_MODEL, provider, model),
    getUserProfile: (): Promise<UserProfile> =>
      ipcRenderer.invoke(IPC.SETTINGS_GET_USER_PROFILE),
    saveUserProfile: (profile: Omit<UserProfile, 'updatedAt'>): Promise<UserProfile> =>
      ipcRenderer.invoke(IPC.SETTINGS_SAVE_USER_PROFILE, profile),
    uploadConductorAvatar: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.SETTINGS_UPLOAD_CONDUCTOR_AVATAR),
    pickAvatarFile: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.SETTINGS_PICK_AVATAR_FILE),
    listCustomProviders: (): Promise<CustomProviderWithStatus[]> =>
      ipcRenderer.invoke(IPC.SETTINGS_CUSTOM_PROVIDER_LIST),
    createCustomProvider: (
      data: Omit<CustomProvider, 'id' | 'deleted' | 'createdAt' | 'updatedAt'>,
    ): Promise<CustomProviderWithStatus> =>
      ipcRenderer.invoke(IPC.SETTINGS_CUSTOM_PROVIDER_CREATE, data),
    updateCustomProvider: (
      id: string,
      data: Partial<Omit<CustomProvider, 'id' | 'slug' | 'deleted' | 'createdAt' | 'updatedAt'>>,
    ): Promise<CustomProviderWithStatus> =>
      ipcRenderer.invoke(IPC.SETTINGS_CUSTOM_PROVIDER_UPDATE, id, data),
    deleteCustomProvider: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC.SETTINGS_CUSTOM_PROVIDER_DELETE, id),
    fetchCustomProviderModels: (customProviderId: string): Promise<ModelsResult> =>
      ipcRenderer.invoke(IPC.SETTINGS_CUSTOM_PROVIDER_FETCH_MODELS, customProviderId),
    listTones: (): Promise<ToneDefinition[]> =>
      ipcRenderer.invoke(IPC.SETTINGS_TONE_LIST),
    createTone: (data: Pick<ToneDefinition, 'name' | 'description'>): Promise<ToneDefinition> =>
      ipcRenderer.invoke(IPC.SETTINGS_TONE_CREATE, data),
    updateTone: (id: string, data: Partial<Pick<ToneDefinition, 'name' | 'description'>>): Promise<ToneDefinition> =>
      ipcRenderer.invoke(IPC.SETTINGS_TONE_UPDATE, id, data),
    deleteTone: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC.SETTINGS_TONE_DELETE, id),
    listSystemPromptTemplates: (): Promise<SystemPromptTemplate[]> =>
      ipcRenderer.invoke(IPC.SETTINGS_SYSTEM_PROMPT_TEMPLATE_LIST),
    createSystemPromptTemplate: (data: Pick<SystemPromptTemplate, 'name' | 'content'>): Promise<SystemPromptTemplate> =>
      ipcRenderer.invoke(IPC.SETTINGS_SYSTEM_PROMPT_TEMPLATE_CREATE, data),
    updateSystemPromptTemplate: (id: string, data: Partial<Pick<SystemPromptTemplate, 'name' | 'content'>>): Promise<SystemPromptTemplate> =>
      ipcRenderer.invoke(IPC.SETTINGS_SYSTEM_PROMPT_TEMPLATE_UPDATE, id, data),
    deleteSystemPromptTemplate: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC.SETTINGS_SYSTEM_PROMPT_TEMPLATE_DELETE, id),
  },
} as const;

contextBridge.exposeInMainWorld('polyphon', api);

// Type export for renderer — imported via window.polyphon
export type PolyphonAPI = typeof api;

// Suppress unused import warning — these types are used in the api shape
export type { Composition, CompositionVoice, Session, Message, ProviderConfig, ProviderStatus, CliTestResult, ModelsResult, UserProfile, CustomProvider, CustomProviderWithStatus, ToneDefinition, SystemPromptTemplate, UpdateInfo, EncryptionStatus, ProbeModelResult };
