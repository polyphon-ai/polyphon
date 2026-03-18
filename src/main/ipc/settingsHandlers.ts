import { ipcMain, dialog, nativeImage, safeStorage } from 'electron';
import {
  requireId,
  requireString,
  requireNonEmptyString,
  requireEnum,
  requireObject,
  requireExternalUrl,
  coerceBoolean,
  requireCliCommand,
  requireEnvVarName,
  requireUserProfileShape,
  MAX_NAME,
  MAX_PROVIDER,
  MAX_MODEL,
  MAX_SHORT_NAME,
} from './validate';
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
  // CLI voices are intentionally user-configured to run local binaries. This
  // validation prevents shell metacharacter injection and path traversal —
  // it does not prevent execution of any binary already on PATH, which is
  // by design and equivalent to the user running the command themselves.
  requireCliCommand(command, 'command');
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
    'https://generativelanguage.googleapis.com/v1beta/models',
    { headers: { 'x-goog-api-key': apiKey } },
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
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
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
      // Log the full body to main-process only; do not forward provider error
      // details to the renderer (they may contain account-identifying strings).
      res.text().catch(() => '').then((body) => {
        if (body) console.error(`[probeModel] HTTP ${res.status} from ${provider}:`, body.slice(0, 500));
      });
      return { ok: false, error: `HTTP ${res.status}` };
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
    // redirect:'manual' prevents fetch from following redirects to internal addresses.
    const res = await fetch(`${cp.baseUrl}/models`, { headers, redirect: 'manual' });
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
    async (_event, command: unknown) => {
      requireCliCommand(command, 'command');
      return testCliVoice(command as string);
    },
  );

  ipcMain.handle(
    IPC.SETTINGS_SAVE_PROVIDER_CONFIG,
    async (_event, config: unknown) => {
      const obj = requireObject(config, 'config');
      requireEnum(obj['provider'], 'provider', SETTINGS_PROVIDERS);
      requireEnum(obj['voiceType'], 'voiceType', ['api', 'cli'] as const);
      coerceBoolean(obj['enabled'], 'enabled');
      if (obj['defaultModel'] != null) requireString(obj['defaultModel'], 'defaultModel', MAX_MODEL);
      if (obj['cliCommand'] != null) requireCliCommand(obj['cliCommand'], 'cliCommand');
      if (obj['cliArgs'] != null) requireString(obj['cliArgs'], 'cliArgs', MAX_NAME);
      return saveProviderConfig(db, config as Omit<ProviderConfig, 'id' | 'createdAt' | 'updatedAt'>);
    },
  );

  ipcMain.handle(IPC.SETTINGS_GET_PROVIDER_CONFIG, () => getAllProviderConfigs(db));

  ipcMain.handle(IPC.SETTINGS_FETCH_MODELS, async (_event, provider: unknown) => {
    requireNonEmptyString(provider, 'provider', MAX_PROVIDER);
    return fetchModelsForProvider(provider as string);
  });

  ipcMain.handle(IPC.SETTINGS_PROBE_MODEL, async (_event, provider: unknown, model: unknown) => {
    requireNonEmptyString(provider, 'provider', MAX_PROVIDER);
    requireNonEmptyString(model, 'model', MAX_MODEL);
    return probeModel(provider as string, model as string);
  });

  ipcMain.handle(IPC.SETTINGS_GET_USER_PROFILE, () => getUserProfile(db));

  ipcMain.handle(
    IPC.SETTINGS_SAVE_USER_PROFILE,
    async (_event, profile: unknown) => {
      requireUserProfileShape(profile);
      return upsertUserProfile(db, profile as Omit<UserProfile, 'updatedAt'>);
    },
  );

  ipcMain.handle(IPC.SETTINGS_UPLOAD_CONDUCTOR_AVATAR, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choose avatar image',
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return null;

    const img = nativeImage.createFromPath(filePaths[0]!);
    if (img.isEmpty()) return null;
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
    if (img.isEmpty()) return null;
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
    async (_event, data: unknown) => {
      const obj = requireObject(data, 'data');
      requireNonEmptyString(obj['name'], 'name', MAX_NAME);
      if (!String(obj['slug'] ?? '').trim()) throw new Error('Provider slug is required');
      requireExternalUrl(obj['baseUrl'], 'baseUrl');
      if (obj['apiKeyEnvVar'] != null && obj['apiKeyEnvVar'] !== '') {
        requireEnvVarName(obj['apiKeyEnvVar'], 'apiKeyEnvVar');
      }
      const cpData = data as Omit<CustomProvider, 'id' | 'deleted' | 'createdAt' | 'updatedAt'>;
      try {
        const cp = createCustomProvider(db, cpData);
        voiceManager.loadCustomProviders(db);
        return resolveCustomProviderStatus(cp);
      } catch (err) {
        if (err instanceof Error && err.message.includes('UNIQUE')) {
          throw new Error(`A custom provider with slug "${cpData.slug}" already exists`);
        }
        throw err;
      }
    },
  );

  ipcMain.handle(
    IPC.SETTINGS_CUSTOM_PROVIDER_UPDATE,
    async (
      _event,
      id: unknown,
      data: unknown,
    ) => {
      requireId(id, 'id');
      const obj = requireObject(data, 'data');
      if (obj['name'] !== undefined) requireNonEmptyString(obj['name'], 'name', MAX_NAME);
      if (obj['baseUrl'] !== undefined) requireExternalUrl(obj['baseUrl'], 'baseUrl');
      if (obj['apiKeyEnvVar'] != null && obj['apiKeyEnvVar'] !== '') {
        requireEnvVarName(obj['apiKeyEnvVar'], 'apiKeyEnvVar');
      }
      const cp = updateCustomProvider(
        db,
        id as string,
        data as Partial<Omit<CustomProvider, 'id' | 'slug' | 'deleted' | 'createdAt' | 'updatedAt'>>,
      );
      voiceManager.loadCustomProviders(db);
      return resolveCustomProviderStatus(cp);
    },
  );

  ipcMain.handle(IPC.SETTINGS_CUSTOM_PROVIDER_DELETE, async (_event, id: unknown) => {
    requireId(id, 'id');
    softDeleteCustomProvider(db, id as string);
    voiceManager.loadCustomProviders(db);
  });

  ipcMain.handle(
    IPC.SETTINGS_CUSTOM_PROVIDER_FETCH_MODELS,
    async (_event, customProviderId: unknown) => {
      requireId(customProviderId, 'customProviderId');
      return fetchModelsForCustomProvider(db, customProviderId as string);
    },
  );

  ipcMain.handle(IPC.SETTINGS_TONE_LIST, () => listTones(db));

  ipcMain.handle(
    IPC.SETTINGS_TONE_CREATE,
    (_event, data: unknown) => {
      const obj = requireObject(data, 'data');
      const name = typeof obj['name'] === 'string' ? obj['name'].trim() : '';
      if (!name) throw new Error('Tone name is required');
      if (name.length > 50) throw new Error('Tone name must be 50 characters or fewer');
      const description = typeof obj['description'] === 'string' ? obj['description'].trim() : '';
      if (!description) throw new Error('Tone description is required');
      try {
        const tone = createTone(db, { name, description });
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
    async (_event, id: unknown, data: unknown) => {
      requireNonEmptyString(id, 'id', MAX_SHORT_NAME);
      const obj = requireObject(data, 'data');
      const patch: Partial<Pick<ToneDefinition, 'name' | 'description'>> = {};
      if (obj['name'] !== undefined) {
        const name = typeof obj['name'] === 'string' ? obj['name'].trim() : '';
        if (!name) throw new Error('Tone name is required');
        if (name.length > 50) throw new Error('Tone name must be 50 characters or fewer');
        patch.name = name;
      }
      if (obj['description'] !== undefined) {
        const description = typeof obj['description'] === 'string' ? obj['description'].trim() : '';
        if (!description) throw new Error('Tone description is required');
        patch.description = description;
      }
      try {
        const tone = updateTone(db, id as string, patch);
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

  ipcMain.handle(IPC.SETTINGS_TONE_DELETE, async (_event, id: unknown) => {
    requireNonEmptyString(id, 'id', MAX_SHORT_NAME);
    deleteTone(db, id as string);
    voiceManager.loadTones(db);
  });

  ipcMain.handle(IPC.SETTINGS_SYSTEM_PROMPT_TEMPLATE_LIST, () => listSystemPromptTemplates(db));

  ipcMain.handle(
    IPC.SETTINGS_SYSTEM_PROMPT_TEMPLATE_CREATE,
    (_event, data: unknown) => {
      const obj = requireObject(data, 'data');
      const name = typeof obj['name'] === 'string' ? obj['name'].trim() : '';
      if (!name) throw new Error('Template name is required');
      if (name.length > 100) throw new Error('Template name must be 100 characters or fewer');
      const content = typeof obj['content'] === 'string' ? obj['content'].trim() : '';
      if (!content) throw new Error('Template content is required');
      const template = createSystemPromptTemplate(db, { name, content });
      voiceManager.loadSystemPromptTemplates(db);
      return template;
    },
  );

  ipcMain.handle(
    IPC.SETTINGS_SYSTEM_PROMPT_TEMPLATE_UPDATE,
    async (_event, id: unknown, data: unknown) => {
      requireId(id, 'id');
      const obj = requireObject(data, 'data');
      const patch: Partial<Pick<SystemPromptTemplate, 'name' | 'content'>> = {};
      if (obj['name'] !== undefined) {
        const name = typeof obj['name'] === 'string' ? obj['name'].trim() : '';
        if (!name) throw new Error('Template name is required');
        if (name.length > 100) throw new Error('Template name must be 100 characters or fewer');
        patch.name = name;
      }
      if (obj['content'] !== undefined) {
        const content = typeof obj['content'] === 'string' ? obj['content'].trim() : '';
        if (!content) throw new Error('Template content is required');
        patch.content = content;
      }
      const template = updateSystemPromptTemplate(db, id as string, patch);
      voiceManager.loadSystemPromptTemplates(db);
      return template;
    },
  );

  ipcMain.handle(IPC.SETTINGS_SYSTEM_PROMPT_TEMPLATE_DELETE, async (_event, id: unknown) => {
    requireId(id, 'id');
    deleteSystemPromptTemplate(db, id as string);
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
