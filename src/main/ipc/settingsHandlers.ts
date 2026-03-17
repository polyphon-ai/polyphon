import { ipcMain, dialog, nativeImage, safeStorage } from 'electron';
import { execFileSync, spawnSync } from 'child_process';
import path from 'node:path';
import { randomUUID } from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import { IPC, PROVIDER_METADATA, SETTINGS_PROVIDERS } from '../../shared/constants';
import type {
  ProviderConfig,
  ProviderStatus,
  CliTestResult,
  ModelsResult,
  UserProfile,
  CustomProvider,
  CustomProviderWithStatus,
  ToneDefinition,
  SystemPromptTemplate,
  EncryptionStatus,
} from '../../shared/types';
import {
  readKeyFile,
  updateKeyWrapping,
  wrapWithSafeStorage,
  wrapWithPassword,
  unwrapWithPassword,
} from '../security/keyManager';
import { resolveApiKey, resolveApiKeyStatus, maskApiKey } from '../utils/env';
import {
  listProviderConfigs,
  upsertProviderConfig,
} from '../db/queries/providerConfigs';
import { getUserProfile, upsertUserProfile } from '../db/queries/userProfile';
import {
  listCustomProviders,
  getCustomProvider,
  createCustomProvider,
  updateCustomProvider,
  softDeleteCustomProvider,
} from '../db/queries/customProviders';
import { listTones, createTone, updateTone, deleteTone } from '../db/queries/tones';
import {
  listSystemPromptTemplates,
  createSystemPromptTemplate,
  updateSystemPromptTemplate,
  deleteSystemPromptTemplate,
} from '../db/queries/systemPromptTemplates';
import type { VoiceManager } from '../managers/VoiceManager';

// Returns resolved env-var status for all settings providers.
// Keys are masked before leaving this function — renderer never sees the full key.
export function getProviderStatus(): ProviderStatus[] {
  return SETTINGS_PROVIDERS.map((provider) => ({
    provider,
    apiKeyStatus: resolveApiKeyStatus(provider),
  }));
}

// Tests whether a CLI command is available on PATH.
export function testCliVoice(command: string): CliTestResult {
  if (process.env.POLYPHON_MOCK_VOICES === '1') {
    return { success: true, path: `/mock/bin/${command}` };
  }

  try {
    const result = spawnSync(command, ['--version'], {
      timeout: 5000,
      encoding: 'utf8',
    });

    if (result.error) {
      return { success: false, error: result.error.message };
    }

    if (result.status !== 0 && result.status !== null) {
      // Some CLIs (e.g. codex) may exit non-zero for --version; treat as success
      // if no spawn error occurred and something was written to stdout/stderr
      const output = (result.stdout || result.stderr || '').trim();
      if (!output) {
        return { success: false, error: `command exited with code ${result.status}` };
      }
    }

    // Resolve the binary's full path
    try {
      const whichCmd = process.platform === 'win32' ? 'where' : 'which';
      const resolved = execFileSync(whichCmd, [command], { encoding: 'utf8' }).trim();
      return { success: true, path: resolved.split('\n')[0]!.trim() };
    } catch {
      return { success: true };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Persists provider config to SQLite.
export function saveProviderConfig(
  db: DatabaseSync,
  config: Omit<ProviderConfig, 'id' | 'createdAt' | 'updatedAt'>,
): ProviderConfig {
  const cliCommand = config.cliCommand ?? PROVIDER_METADATA[config.provider]?.defaultCliCommand ?? null;
  return upsertProviderConfig(db, { ...config, id: randomUUID(), cliCommand });
}

// Loads all saved provider configs from SQLite.
export function getAllProviderConfigs(db: DatabaseSync): ProviderConfig[] {
  return listProviderConfigs(db);
}

async function fetchAnthropicModels(apiKey: string): Promise<ModelsResult> {
  const res = await fetch('https://api.anthropic.com/v1/models', {
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
  });
  if (!res.ok) return { models: [], error: `Anthropic API returned ${res.status}` };
  const data = await res.json() as { data: { id: string }[] };
  return { models: data.data.map((m) => m.id) };
}

async function fetchOpenAIModels(apiKey: string): Promise<ModelsResult> {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return { models: [], error: `OpenAI API returned ${res.status}` };
  const data = await res.json() as { data: { id: string }[] };
  const models = data.data
    .map((m) => m.id)
    .filter((id) => /^(gpt-|o\d|chatgpt)/.test(id))
    .sort();
  return { models };
}

async function fetchGeminiModels(apiKey: string): Promise<ModelsResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
  );
  if (!res.ok) return { models: [], error: `Gemini API returned ${res.status}` };
  const data = await res.json() as {
    models: { name: string; description?: string; supportedGenerationMethods: string[] }[];
  };
  const all = data.models
    .filter((m) => m.supportedGenerationMethods.includes('generateContent'))
    .filter((m) => !m.description?.toLowerCase().includes('deprecated'))
    .map((m) => m.name.replace('models/', ''))
    .sort();
  // Drop pinned versioned variants (e.g. "gemini-2.0-flash-001") when the bare
  // alias exists (e.g. "gemini-2.0-flash"), since Google deprecates versioned
  // suffixes while the alias always resolves to the current stable version.
  const models = all.filter(
    (m) => !/-\d+$/.test(m) || !all.some((alias) => !/-\d+$/.test(alias) && m.startsWith(alias + '-')),
  );
  return { models };
}

export async function fetchModelsForProvider(provider: string): Promise<ModelsResult> {
  const supported = ['anthropic', 'openai', 'gemini'];
  if (!supported.includes(provider)) {
    return { models: [], error: `model fetching not supported for ${provider}` };
  }
  let apiKey: string;
  try {
    apiKey = resolveApiKey(provider);
  } catch (err) {
    return { models: [], error: err instanceof Error ? err.message : String(err) };
  }
  try {
    switch (provider) {
      case 'anthropic': return await fetchAnthropicModels(apiKey);
      case 'openai': return await fetchOpenAIModels(apiKey);
      case 'gemini': return await fetchGeminiModels(apiKey);
      default: return { models: [], error: `model fetching not supported for ${provider}` };
    }
  } catch (err) {
    return { models: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export type ProbeModelResult = { ok: true } | { ok: false; error: string };

export async function probeModel(provider: string, model: string): Promise<ProbeModelResult> {
  let apiKey: string;
  try {
    apiKey = resolveApiKey(provider);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  try {
    let res: Response;
    if (provider === 'anthropic') {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 16,
          messages: [{ role: 'user', content: 'What is 2+2?' }],
        }),
      });
    } else if (provider === 'openai') {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 16,
          messages: [{ role: 'user', content: 'What is 2+2?' }],
        }),
      });
    } else if (provider === 'gemini') {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'What is 2+2?' }] }],
            generationConfig: { maxOutputTokens: 16 },
          }),
        },
      );
    } else {
      return { ok: false, error: `probeModel not supported for provider: ${provider}` };
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function resolveCustomProviderStatus(cp: CustomProvider): CustomProviderWithStatus {
  if (!cp.apiKeyEnvVar) return { ...cp, apiKeyStatus: null };
  const specificValue = process.env[cp.apiKeyEnvVar]?.trim();
  if (specificValue) {
    return { ...cp, apiKeyStatus: { status: 'specific', varName: cp.apiKeyEnvVar, maskedKey: maskApiKey(specificValue) } };
  }
  return { ...cp, apiKeyStatus: { status: 'none', specificVar: cp.apiKeyEnvVar, fallbackVar: cp.apiKeyEnvVar } };
}

export function listCustomProvidersWithStatus(db: DatabaseSync): CustomProviderWithStatus[] {
  return listCustomProviders(db).map(resolveCustomProviderStatus);
}

export async function fetchModelsForCustomProvider(
  db: DatabaseSync,
  customProviderId: string,
): Promise<ModelsResult> {
  const cp = getCustomProvider(db, customProviderId);
  if (!cp) return { models: [], error: 'Custom provider not found' };
  if (cp.deleted) return { models: [], error: 'Custom provider has been deleted' };

  try {
    const headers: Record<string, string> = {};
    if (cp.apiKeyEnvVar) {
      const key = process.env[cp.apiKeyEnvVar]?.trim();
      if (key) headers['Authorization'] = `Bearer ${key}`;
    }
    const res = await fetch(`${cp.baseUrl}/models`, { headers });
    if (!res.ok) return { models: [], error: `Endpoint returned ${res.status}` };
    const data = await res.json() as { data: { id: string }[] };
    if (!data?.data) return { models: [], error: 'Unexpected response format from endpoint' };
    return { models: data.data.map((m) => m.id) };
  } catch (err) {
    return { models: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export interface EncryptionContext {
  userDataPath: string;
  dbKey: Buffer;
  e2e: boolean;
}

export function registerSettingsHandlers(db: DatabaseSync, voiceManager: VoiceManager, encCtx?: EncryptionContext): void {
  ipcMain.handle(IPC.SETTINGS_GET_PROVIDER_STATUS, () => getProviderStatus());

  ipcMain.handle(
    IPC.SETTINGS_TEST_CLI_VOICE,
    (_event, command: string) => testCliVoice(command),
  );

  ipcMain.handle(
    IPC.SETTINGS_SAVE_PROVIDER_CONFIG,
    (_event, config: Omit<ProviderConfig, 'id' | 'createdAt' | 'updatedAt'>) =>
      saveProviderConfig(db, config),
  );

  ipcMain.handle(IPC.SETTINGS_GET_PROVIDER_CONFIG, () => getAllProviderConfigs(db));

  ipcMain.handle(IPC.SETTINGS_FETCH_MODELS, (_event, provider: string) =>
    fetchModelsForProvider(provider),
  );

  ipcMain.handle(IPC.SETTINGS_PROBE_MODEL, (_event, provider: string, model: string) =>
    probeModel(provider, model),
  );

  ipcMain.handle(IPC.SETTINGS_GET_USER_PROFILE, () => getUserProfile(db));

  ipcMain.handle(
    IPC.SETTINGS_SAVE_USER_PROFILE,
    (_event, profile: Omit<UserProfile, 'updatedAt'>) => upsertUserProfile(db, profile),
  );

  ipcMain.handle(IPC.SETTINGS_UPLOAD_CONDUCTOR_AVATAR, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choose avatar image',
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return null;

    const img = nativeImage.createFromPath(filePaths[0]!);
    const resized = img.resize({ width: 100, height: 100 });
    const dataUrl = `data:image/png;base64,${resized.toPNG().toString('base64')}`;

    const profile = getUserProfile(db);
    upsertUserProfile(db, { ...profile, conductorAvatar: dataUrl });
    return dataUrl;
  });

  // Opens file picker and returns raw image data URL for renderer-side editing.
  // Does not resize or save — the renderer edits then saves via saveUserProfile.
  ipcMain.handle(IPC.SETTINGS_PICK_AVATAR_FILE, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choose avatar image',
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return null;

    const img = nativeImage.createFromPath(filePaths[0]!);
    const size = img.getSize();
    const maxDim = 1200;
    if (size.width > maxDim || size.height > maxDim) {
      const ratio = Math.min(maxDim / size.width, maxDim / size.height);
      const r = img.resize({ width: Math.round(size.width * ratio), height: Math.round(size.height * ratio) });
      return `data:image/png;base64,${r.toPNG().toString('base64')}`;
    }
    return `data:image/png;base64,${img.toPNG().toString('base64')}`;
  });

  ipcMain.handle(IPC.SETTINGS_CUSTOM_PROVIDER_LIST, () => listCustomProvidersWithStatus(db));

  ipcMain.handle(
    IPC.SETTINGS_CUSTOM_PROVIDER_CREATE,
    (_event, data: Omit<CustomProvider, 'id' | 'deleted' | 'createdAt' | 'updatedAt'>) => {
      if (!data.name?.trim()) throw new Error('Provider name is required');
      if (!data.slug?.trim()) throw new Error('Provider slug is required');
      if (!data.baseUrl?.trim()) throw new Error('Base URL is required');
      try {
        const cp = createCustomProvider(db, data);
        voiceManager.loadCustomProviders(db);
        return resolveCustomProviderStatus(cp);
      } catch (err) {
        if (err instanceof Error && err.message.includes('UNIQUE')) {
          throw new Error(`A custom provider with slug "${data.slug}" already exists`);
        }
        throw err;
      }
    },
  );

  ipcMain.handle(
    IPC.SETTINGS_CUSTOM_PROVIDER_UPDATE,
    (
      _event,
      id: string,
      data: Partial<Omit<CustomProvider, 'id' | 'slug' | 'deleted' | 'createdAt' | 'updatedAt'>>,
    ) => {
      if (data.name !== undefined && !data.name.trim()) throw new Error('Provider name is required');
      if (data.baseUrl !== undefined && !data.baseUrl.trim()) throw new Error('Base URL is required');
      const cp = updateCustomProvider(db, id, data);
      voiceManager.loadCustomProviders(db);
      return resolveCustomProviderStatus(cp);
    },
  );

  ipcMain.handle(IPC.SETTINGS_CUSTOM_PROVIDER_DELETE, (_event, id: string) => {
    softDeleteCustomProvider(db, id);
    voiceManager.loadCustomProviders(db);
  });

  ipcMain.handle(
    IPC.SETTINGS_CUSTOM_PROVIDER_FETCH_MODELS,
    (_event, customProviderId: string) => fetchModelsForCustomProvider(db, customProviderId),
  );

  ipcMain.handle(IPC.SETTINGS_TONE_LIST, () => listTones(db));

  ipcMain.handle(
    IPC.SETTINGS_TONE_CREATE,
    (_event, data: Pick<ToneDefinition, 'name' | 'description'>) => {
      const name = data.name?.trim() ?? '';
      if (!name) throw new Error('Tone name is required');
      if (name.length > 50) throw new Error('Tone name must be 50 characters or fewer');
      if (!data.description?.trim()) throw new Error('Tone description is required');
      try {
        const tone = createTone(db, { name, description: data.description.trim() });
        voiceManager.loadTones(db);
        return tone;
      } catch (err) {
        if (err instanceof Error && err.message.includes('UNIQUE')) {
          throw new Error(`A tone named "${name}" already exists`);
        }
        throw err;
      }
    },
  );

  ipcMain.handle(
    IPC.SETTINGS_TONE_UPDATE,
    (_event, id: string, data: Partial<Pick<ToneDefinition, 'name' | 'description'>>) => {
      if (data.name !== undefined) {
        const name = data.name.trim();
        if (!name) throw new Error('Tone name is required');
        if (name.length > 50) throw new Error('Tone name must be 50 characters or fewer');
        data = { ...data, name };
      }
      if (data.description !== undefined && !data.description.trim()) {
        throw new Error('Tone description is required');
      }
      try {
        const tone = updateTone(db, id, data);
        voiceManager.loadTones(db);
        return tone;
      } catch (err) {
        if (err instanceof Error && err.message.includes('UNIQUE')) {
          throw new Error(`A tone with that name already exists`);
        }
        throw err;
      }
    },
  );

  ipcMain.handle(IPC.SETTINGS_TONE_DELETE, (_event, id: string) => {
    deleteTone(db, id);
    voiceManager.loadTones(db);
  });

  ipcMain.handle(IPC.SETTINGS_SYSTEM_PROMPT_TEMPLATE_LIST, () => listSystemPromptTemplates(db));

  ipcMain.handle(
    IPC.SETTINGS_SYSTEM_PROMPT_TEMPLATE_CREATE,
    (_event, data: Pick<SystemPromptTemplate, 'name' | 'content'>) => {
      const name = data.name?.trim() ?? '';
      if (!name) throw new Error('Template name is required');
      if (name.length > 100) throw new Error('Template name must be 100 characters or fewer');
      if (!data.content?.trim()) throw new Error('Template content is required');
      const template = createSystemPromptTemplate(db, { name, content: data.content.trim() });
      voiceManager.loadSystemPromptTemplates(db);
      return template;
    },
  );

  ipcMain.handle(
    IPC.SETTINGS_SYSTEM_PROMPT_TEMPLATE_UPDATE,
    (_event, id: string, data: Partial<Pick<SystemPromptTemplate, 'name' | 'content'>>) => {
      if (data.name !== undefined) {
        const name = data.name.trim();
        if (!name) throw new Error('Template name is required');
        if (name.length > 100) throw new Error('Template name must be 100 characters or fewer');
        data = { ...data, name };
      }
      if (data.content !== undefined && !data.content.trim()) {
        throw new Error('Template content is required');
      }
      const template = updateSystemPromptTemplate(db, id, data);
      voiceManager.loadSystemPromptTemplates(db);
      return template;
    },
  );

  ipcMain.handle(IPC.SETTINGS_SYSTEM_PROMPT_TEMPLATE_DELETE, (_event, id: string) => {
    deleteSystemPromptTemplate(db, id);
    voiceManager.loadSystemPromptTemplates(db);
  });

  if (!encCtx) return;
  const { userDataPath, dbKey, e2e } = encCtx;
  const keyFilePath = path.join(userDataPath, 'polyphon.key.json');

  ipcMain.handle(IPC.ENCRYPTION_GET_STATUS, (): EncryptionStatus => {
    if (e2e) return { available: true, mode: 'e2e-test', passwordSet: false, linuxBasicText: false, linuxNoticeDismissed: true };
    const available = safeStorage.isEncryptionAvailable();
    const keyFile = readKeyFile(keyFilePath);
    const passwordSet = keyFile?.wrapping === 'password';
    const backend = (safeStorage as typeof safeStorage & { getSelectedStorageBackend?(): string }).getSelectedStorageBackend?.() ?? '';
    const linuxBasicText = backend === 'basic_text';
    return {
      available,
      mode: passwordSet ? 'password' : 'safeStorage',
      passwordSet,
      linuxBasicText,
      linuxNoticeDismissed: keyFile?.linuxNoticeDismissed ?? false,
    };
  });

  ipcMain.handle(IPC.ENCRYPTION_SET_PASSWORD, (_event, newPassword: string) => {
    if (!newPassword || newPassword.length > 1024) throw new Error('Invalid password');
    const keyFile = readKeyFile(keyFilePath);
    if (!keyFile || keyFile.wrapping !== 'safeStorage') throw new Error('Can only set password when using safeStorage wrapping');
    const wrapped = wrapWithPassword(dbKey, newPassword);
    updateKeyWrapping(userDataPath, { version: 1, wrapping: 'password', linuxNoticeDismissed: keyFile.linuxNoticeDismissed, ...wrapped });
  });

  ipcMain.handle(IPC.ENCRYPTION_CHANGE_PASSWORD, (_event, oldPassword: string, newPassword: string) => {
    if (!newPassword || newPassword.length > 1024) throw new Error('Invalid new password');
    const keyFile = readKeyFile(keyFilePath);
    if (!keyFile || keyFile.wrapping !== 'password') throw new Error('No password is currently set');
    // Verify old password
    unwrapWithPassword(keyFile, oldPassword);
    const wrapped = wrapWithPassword(dbKey, newPassword);
    updateKeyWrapping(userDataPath, { version: 1, wrapping: 'password', linuxNoticeDismissed: keyFile.linuxNoticeDismissed, ...wrapped });
  });

  ipcMain.handle(IPC.ENCRYPTION_REMOVE_PASSWORD, (_event, currentPassword: string) => {
    const keyFile = readKeyFile(keyFilePath);
    if (!keyFile || keyFile.wrapping !== 'password') throw new Error('No password is currently set');
    // Verify current password
    unwrapWithPassword(keyFile, currentPassword);
    const encryptedKey = wrapWithSafeStorage(dbKey, safeStorage);
    updateKeyWrapping(userDataPath, { version: 1, wrapping: 'safeStorage', encryptedKey, linuxNoticeDismissed: keyFile.linuxNoticeDismissed });
  });

  ipcMain.handle(IPC.ENCRYPTION_DISMISS_LINUX_NOTICE, () => {
    const keyFile = readKeyFile(keyFilePath);
    if (!keyFile) return;
    updateKeyWrapping(userDataPath, { ...keyFile, linuxNoticeDismissed: true });
  });
}
