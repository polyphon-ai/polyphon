import React, { useEffect, useRef, useState } from 'react';
import {
  Pencil,
  Trash2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Plus,
  Check,
  X,
  RefreshCw,
  Copy,
  Loader2,
  ChevronDown,
  ChevronUp,
  Music2,
  FileText,
  Plug,
  SlidersHorizontal,
  Camera,
  Wand2,
  Info,
  Lock,
  ScrollText,
  Download,
} from 'lucide-react';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore, type Theme } from '../../store/uiStore';
import {
  SETTINGS_PROVIDERS,
  PROVIDER_METADATA,
  type VoiceType,
} from '../../../shared/constants';
import type { ApiKeyStatus, ProviderConfig, CustomProvider, CustomProviderWithStatus, ToneDefinition, SystemPromptTemplate } from '../../../shared/types';
import ProviderLogo from '../Shared/ProviderLogo';
import { HelpTooltip } from '../Shared/HelpTooltip';
import { ColorPicker } from '../Shared';
import { AvatarEditor } from './AvatarEditor';
import AboutPage from './AboutPage';
import EncryptionSection from './EncryptionSection';

// ── API Key Status badge ────────────────────────────────────────────────────

function ApiKeyBadge({ status }: { status: ApiKeyStatus }) {
  if (status.status === 'specific') {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle size={14} strokeWidth={1.75} className="text-green-600 dark:text-green-400 shrink-0" />
          <span className="font-mono text-green-600 dark:text-green-400 text-xs">{status.varName}</span>
          <span className="text-gray-500 text-xs">(specific)</span>
        </div>
        <div className="font-mono text-xs text-gray-500 dark:text-gray-400 pl-5">{status.maskedKey}</div>
      </div>
    );
  }

  if (status.status === 'fallback') {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm">
          <AlertTriangle size={14} strokeWidth={1.75} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="font-mono text-amber-600 dark:text-amber-400 text-xs">{status.varName}</span>
          <span className="text-gray-500 text-xs">(fallback)</span>
        </div>
        <div className="font-mono text-xs text-gray-500 dark:text-gray-400 pl-5">{status.maskedKey}</div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-sm">
        <XCircle size={14} strokeWidth={1.75} className="text-red-600 dark:text-red-400 shrink-0" />
        <span className="text-red-600 dark:text-red-400 text-xs">No key found</span>
      </div>
      <div className="text-xs text-gray-500 pl-5 space-y-0.5">
        <div className="font-mono">{status.specificVar}</div>
        <div className="font-mono">{status.fallbackVar}</div>
      </div>
    </div>
  );
}

// ── Toggle switch ───────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 ${
        checked ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-700'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ── Theme selector ──────────────────────────────────────────────────────────

function ThemeSelector() {
  const { theme, setTheme } = useUIStore();
  const options: { value: Theme; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
  ];
  return (
    <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-700 w-fit">
      {options.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={`px-4 py-1.5 text-sm font-medium transition-colors ${
            theme === value
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Provider Card ───────────────────────────────────────────────────────────

function ProviderCard({ provider }: { provider: string }) {
  const meta = PROVIDER_METADATA[provider];

  const {
    providerStatuses, providerConfigs, cliTestStates, modelFetchStates,
    saveConfirmation, saveConfig, testCli, clearCliTest, fetchModels,
  } = useSettingsStore();

  const status = providerStatuses[provider];
  const typeConfigs = providerConfigs[provider] ?? {};
  const apiConfig = typeConfigs.api;
  const cliConfig = typeConfigs.cli;
  const cliTest = cliTestStates[provider];
  const modelFetch = modelFetchStates[provider];
  const showConfirmation = saveConfirmation === provider;

  const [localCommand, setLocalCommand] = useState(
    cliConfig?.cliCommand ?? meta?.defaultCliCommand ?? '',
  );
  const [localCliArgs, setLocalCliArgs] = useState(cliConfig?.cliArgs ?? '');

  useEffect(() => {
    setLocalCommand(cliConfig?.cliCommand ?? meta?.defaultCliCommand ?? '');
  }, [cliConfig?.cliCommand, meta?.defaultCliCommand]);

  useEffect(() => {
    setLocalCliArgs(cliConfig?.cliArgs ?? '');
  }, [cliConfig?.cliArgs]);

  // Auto-fetch models when API is enabled and has a key
  useEffect(() => {
    if (
      apiConfig?.enabled &&
      status?.apiKeyStatus.status !== 'none' &&
      !modelFetch
    ) {
      fetchModels(provider);
    }
  }, [apiConfig?.enabled, status?.apiKeyStatus.status]);

  if (!meta) return null;

  const hasApiKey = status?.apiKeyStatus.status !== 'none';
  const supportsApi = meta.supportedTypes.includes('api');
  const supportsCli = meta.supportedTypes.includes('cli');

  const availableModels =
    modelFetch?.status === 'done' && modelFetch.models.length > 0
      ? modelFetch.models
      : meta.defaultModels;

  function updateType(voiceType: VoiceType, patch: Partial<Omit<ProviderConfig, 'id' | 'createdAt' | 'updatedAt'>>) {
    const existing = typeConfigs[voiceType];
    const base = existing
      ? { ...existing }
      : {
          provider,
          voiceType,
          enabled: false,
          defaultModel: voiceType === 'api' ? (meta?.defaultModels[0] ?? null) : null,
          cliCommand: voiceType === 'cli' ? (meta?.defaultCliCommand ?? null) : null,
          cliArgs: null,
          yoloMode: false,
        };
    saveConfig({ ...base, ...patch, provider, voiceType } as Omit<ProviderConfig, 'id' | 'createdAt' | 'updatedAt'>);
  }

  function handleCommandBlur() {
    if (localCommand !== cliConfig?.cliCommand) {
      updateType('cli', { cliCommand: localCommand });
      clearCliTest(provider);
    }
  }

  const cliCommandId = `cli-command-${provider}`;
  const cliArgsId = `cli-args-${provider}`;
  const cliArgsHintId = `cli-args-hint-${provider}`;
  const defaultModelId = `default-model-${provider}`;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 transition-all duration-200">
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-lg"
            style={{ backgroundColor: `${meta.color}20` }}
          >
            <ProviderLogo provider={provider} size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 dark:text-gray-100">{meta.name}</span>
              {showConfirmation && (
                <span className="text-xs text-green-600 dark:text-green-400 animate-pulse">Saved</span>
              )}
            </div>
            <div className="text-xs text-gray-500">
              {meta.supportedTypes.join(' · ').toUpperCase()}
            </div>
          </div>
        </div>
      </div>

      {/* One section per supported voice type */}
      <div className="border-t border-gray-200 dark:border-gray-800 divide-y divide-gray-200 dark:divide-gray-800">

        {/* API section */}
        {supportsApi && status && (
          <div className={`px-5 py-4 space-y-3 transition-opacity ${apiConfig?.enabled ? '' : 'opacity-60'}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                API
                <HelpTooltip text="Uses the provider's remote API. Requires an API key set in your environment." />
              </span>
              <Toggle
                checked={apiConfig?.enabled ?? false}
                onChange={(v) => updateType('api', { enabled: v })}
              />
            </div>

            {apiConfig?.enabled && (
              <div className="rounded-lg bg-gray-100 dark:bg-gray-800/50 p-4 space-y-3">
                <ApiKeyBadge status={status.apiKeyStatus} />

                {(meta.defaultModels.length > 0 || (modelFetch?.models.length ?? 0) > 0) && (
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <label htmlFor={defaultModelId} className="text-xs text-gray-500">Default model</label>
                      {modelFetch?.status === 'fetching' && (
                        <span className="text-xs text-orange-600 dark:text-orange-400 animate-pulse">Loading model list…</span>
                      )}
                      {modelFetch?.status === 'done' && (
                        <span className="text-xs text-green-600 dark:text-green-400">Loaded model list</span>
                      )}
                      {modelFetch?.status === 'error' && (
                        <span className="text-xs text-red-600 dark:text-red-400">
                          {modelFetch.error?.includes('401') ? 'Invalid API key' : 'Failed to load'}
                        </span>
                      )}
                      <button
                        onClick={() => fetchModels(provider)}
                        disabled={modelFetch?.status === 'fetching' || !hasApiKey}
                        className="ml-auto text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-40 transition-colors flex items-center gap-1"
                        aria-label={`Refresh models for ${meta.name}`}
                      >
                        {modelFetch?.status === 'fetching'
                          ? <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
                          : <RefreshCw size={14} strokeWidth={1.75} />
                        }
                        Refresh
                      </button>
                    </div>
                    <select
                      id={defaultModelId}
                      value={apiConfig?.defaultModel ?? availableModels[0] ?? ''}
                      onChange={(e) => updateType('api', { defaultModel: e.target.value })}
                      disabled={modelFetch?.status === 'fetching'}
                      className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full max-w-xs disabled:opacity-50"
                    >
                      {availableModels.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* CLI section */}
        {supportsCli && meta.defaultCliCommand !== null && (
          <div className={`px-5 py-4 space-y-3 transition-opacity ${cliConfig?.enabled ? '' : 'opacity-60'}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                CLI
                <HelpTooltip text="Uses your locally installed CLI tool. No API key required." />
              </span>
              <Toggle
                checked={cliConfig?.enabled ?? false}
                onChange={(v) => updateType('cli', { enabled: v })}
              />
            </div>

            {cliConfig?.enabled && (
              <div className="rounded-lg bg-gray-100 dark:bg-gray-800/50 p-4 space-y-3">
                <p className="text-xs text-gray-500 leading-relaxed">
                  Uses your existing {meta.name} CLI configuration (auth, default model, etc.).
                  Add extra arguments below to override those defaults for this voice.
                </p>
                <div className="flex items-center gap-2">
                  <label htmlFor={cliCommandId} className="sr-only">CLI command</label>
                  <input
                    id={cliCommandId}
                    type="text"
                    value={localCommand}
                    onChange={(e) => {
                      setLocalCommand(e.target.value);
                      clearCliTest(provider);
                    }}
                    onBlur={handleCommandBlur}
                    placeholder={meta.defaultCliCommand}
                    className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-1 max-w-xs"
                  />
                  <button
                    onClick={() => testCli(provider, localCommand || meta.defaultCliCommand!)}
                    disabled={cliTest?.status === 'testing'}
                    className="px-3 py-2 text-sm font-medium rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 disabled:opacity-50 transition-colors border border-gray-300 dark:border-gray-600"
                  >
                    {cliTest?.status === 'testing' ? 'Testing…' : 'Test'}
                  </button>
                </div>

                {cliTest && cliTest.status !== 'idle' && cliTest.status !== 'testing' && cliTest.result && (
                  <div
                    className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${
                      cliTest.result.success
                        ? 'bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900'
                        : 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900'
                    }`}
                  >
                    {cliTest.result.success
                      ? <Check size={14} strokeWidth={1.75} className="shrink-0 mt-0.5" />
                      : <X size={14} strokeWidth={1.75} className="shrink-0 mt-0.5" />
                    }
                    <span className="font-mono">
                      {cliTest.result.success
                        ? `${localCommand} found at ${cliTest.result.path ?? 'unknown path'}`
                        : `command not found: ${cliTest.result.error ?? localCommand}`}
                    </span>
                  </div>
                )}

                <div>
                  <label htmlFor={cliArgsId} className="block text-xs text-gray-500 mb-1.5">Extra arguments</label>
                  <input
                    id={cliArgsId}
                    type="text"
                    value={localCliArgs}
                    onChange={(e) => setLocalCliArgs(e.target.value)}
                    onBlur={() => {
                      const args = localCliArgs.trim() || null;
                      if (args !== cliConfig?.cliArgs) {
                        updateType('cli', { cliArgs: args });
                      }
                    }}
                    placeholder="--model <model>"
                    aria-describedby={cliArgsHintId}
                    className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full max-w-xs"
                  />
                  <p id={cliArgsHintId} className="text-xs text-gray-400 mt-1">
                    Additional CLI flags passed to every invocation of this voice.
                  </p>
                </div>

                {meta.yoloFlag && (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
                      <input
                        type="checkbox"
                        checked={cliConfig?.yoloMode ?? false}
                        onChange={(e) => updateType('cli', { yoloMode: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Enable YOLO mode</span>
                    </label>
                    {cliConfig?.yoloMode && (
                      <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5">
                        <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                        <div className="space-y-0.5">
                          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">YOLO mode active — use at your own risk</p>
                          <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                            Passes <code className="font-mono">{meta.yoloFlag}</code> to every invocation.
                            The CLI runs without confirmation prompts and with full tool access — it can read, write, and execute anything on your system.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// ── Conductor Profile ───────────────────────────────────────────────────────

const PRONOUN_OPTIONS = [
  { value: '', label: 'Select pronouns…' },
  { value: 'she/her', label: 'she/her' },
  { value: 'he/him', label: 'he/him' },
  { value: 'they/them', label: 'they/them' },
  { value: 'she/they', label: 'she/they' },
  { value: 'he/they', label: 'he/they' },
  { value: 'ze/zir', label: 'ze/zir' },
  { value: 'xe/xem', label: 'xe/xem' },
  { value: 'any/all', label: 'any/all' },
  { value: 'prefer not to say', label: 'prefer not to say' },
];

function ConductorProfile() {
  const { userProfile, profileSaved, saveUserProfile, pickAvatarFile, confirmAvatar, dismissPendingAvatar, pendingAvatarSrc, tones } = useSettingsStore();
  const [name, setName] = useState(userProfile.conductorName);
  const [pronouns, setPronouns] = useState(userProfile.pronouns);
  const [context, setContext] = useState(userProfile.conductorContext);
  const [tone, setTone] = useState(userProfile.defaultTone);
  const [conductorColor, setConductorColor] = useState(userProfile.conductorColor);

  // Sync local state when store loads profile from DB
  useEffect(() => {
    setName(userProfile.conductorName);
    setPronouns(userProfile.pronouns);
    setContext(userProfile.conductorContext);
    setTone(userProfile.defaultTone);
    setConductorColor(userProfile.conductorColor);
  }, [userProfile.conductorName, userProfile.pronouns, userProfile.conductorContext, userProfile.defaultTone, userProfile.conductorColor]);

  const handleSave = () => {
    saveUserProfile({ conductorName: name, pronouns, conductorContext: context, defaultTone: tone, conductorColor, conductorAvatar: userProfile.conductorAvatar });
  };

  const handleColorSelect = (c: string) => {
    setConductorColor(c);
    saveUserProfile({ conductorName: name, pronouns, conductorContext: context, defaultTone: tone, conductorColor: c, conductorAvatar: userProfile.conductorAvatar });
  };

  const handleRemoveAvatar = () => {
    saveUserProfile({ conductorName: name, pronouns, conductorContext: context, defaultTone: tone, conductorColor, conductorAvatar: '' });
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 space-y-4">
      <div className="space-y-3">
        {/* Avatar + color */}
        <div className="flex items-center gap-4">
          <div className="relative shrink-0 group/avatar">
            <button
              onClick={pickAvatarFile}
              aria-label="Upload photo"
              style={!userProfile.conductorAvatar ? { backgroundColor: conductorColor || '#6b7280' } : undefined}
              className="w-16 h-16 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              {userProfile.conductorAvatar ? (
                <img src={userProfile.conductorAvatar} alt="Your avatar" className="w-full h-full object-cover" />
              ) : (
                <Wand2 size={26} strokeWidth={1.5} className="text-white/80" />
              )}
              <span className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                <Camera size={18} strokeWidth={1.75} className="text-white" />
              </span>
            </button>
            {userProfile.conductorAvatar && (
              <button
                onClick={handleRemoveAvatar}
                aria-label="Remove photo"
                className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-red-500 dark:hover:bg-red-500 text-gray-600 dark:text-gray-300 hover:text-white flex items-center justify-center transition-colors"
              >
                <X size={10} strokeWidth={2.5} />
              </button>
            )}
          </div>
          {pendingAvatarSrc ? (
            <AvatarEditor
              src={pendingAvatarSrc}
              onConfirm={confirmAvatar}
              onCancel={dismissPendingAvatar}
            />
          ) : (
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                Choose display color for your voice
                <HelpTooltip text="Appears next to your messages in the conversation view. This color is reserved so no voice can use the same one." />
              </label>
              <ColorPicker
                value={conductorColor || '#6b7280'}
                onChange={handleColorSelect}
                includeGray
              />
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <div className="flex items-baseline justify-between mb-1">
              <label htmlFor="conductor-name" className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Your name
                <HelpTooltip text="How voices address you in conversation." />
              </label>
              <span className="text-xs text-gray-400" aria-live="polite">{name.length}/25</span>
            </div>
            <input
              id="conductor-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Corey"
              maxLength={25}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="w-44">
            <label htmlFor="conductor-pronouns" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Pronouns
              <HelpTooltip text="Included in the system prompt so voices use the right pronouns when referring to you." />
            </label>
            <select
              id="conductor-pronouns"
              value={pronouns}
              onChange={(e) => setPronouns(e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {PRONOUN_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-1">
            <label htmlFor="conductor-context" className="text-xs font-medium text-gray-700 dark:text-gray-300">
              About you
              <HelpTooltip text="Background context shared with all voices to personalize their responses to you." />
            </label>
            <span className="text-xs text-gray-400" aria-live="polite">{context.length}/250</span>
          </div>
          <textarea
            id="conductor-context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="e.g. Senior backend engineer working on a distributed payments system."
            rows={3}
            maxLength={250}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        <div>
          <label htmlFor="conductor-tone" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Default conversation tone
            <HelpTooltip text="Sets the personality and style for all voices. Can be overridden per voice in a composition." />
          </label>
          <select
            id="conductor-tone"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {tones.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {t.description}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            Applied to all voices unless overridden per voice in a composition.
          </p>
        </div>

      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleSave}
          className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
        >
          Save
        </button>
        {profileSaved && (
          <span className="text-xs text-green-600 dark:text-green-400">Saved</span>
        )}
      </div>
    </div>
  );
}

// ── Custom Providers ─────────────────────────────────────────────────────────

function CustomProviderApiKeyBadge({ cp }: { cp: CustomProviderWithStatus }) {
  if (!cp.apiKeyEnvVar) {
    return (
      <div className="text-xs text-gray-500 dark:text-gray-400">
        No API key required (auth-less endpoint)
      </div>
    );
  }
  const status = cp.apiKeyStatus;
  if (!status || status.status === 'none') {
    return (
      <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
        <XCircle size={14} strokeWidth={1.75} className="shrink-0" />
        <span>
          Env var <span className="font-mono">{cp.apiKeyEnvVar}</span> not set
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
      <CheckCircle size={14} strokeWidth={1.75} className="shrink-0" />
      <span className="font-mono">{cp.apiKeyEnvVar}</span>
      <span className="text-gray-500 dark:text-gray-400 font-mono">{status.maskedKey}</span>
    </div>
  );
}

type CustomProviderFormData = {
  name: string;
  slug: string;
  baseUrl: string;
  apiKeyEnvVar: string;
  defaultModel: string;
};

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function CustomProviderForm({
  initial,
  isNew,
  onSave,
  onCancel,
}: {
  initial?: CustomProviderWithStatus;
  isNew: boolean;
  onSave: (data: Omit<CustomProvider, 'id' | 'deleted' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [slugEdited, setSlugEdited] = useState(!!initial?.slug);
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '');
  const [apiKeyEnvVar, setApiKeyEnvVar] = useState(initial?.apiKeyEnvVar ?? '');
  const [defaultModel, setDefaultModel] = useState(initial?.defaultModel ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formId = initial?.id ?? 'new';
  const baseUrlHintId = `base-url-hint-${formId}`;
  const apiKeyHintId = `api-key-hint-${formId}`;

  function handleNameChange(v: string) {
    setName(v);
    if (!slugEdited) setSlug(slugify(v));
  }

  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!slug.trim()) { setError('Slug is required'); return; }
    if (!baseUrl.trim()) { setError('Base URL is required'); return; }
    if (!defaultModel.trim()) { setError('Default model is required'); return; }
    setError(null);
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        slug: slug.trim(),
        baseUrl: baseUrl.trim(),
        apiKeyEnvVar: apiKeyEnvVar.trim() || null,
        defaultModel: defaultModel.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`cp-name-${formId}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            id={`cp-name-${formId}`}
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Ollama"
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label htmlFor={`cp-slug-${formId}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Slug <span className="text-red-500">*</span>
            {isNew && <span className="text-gray-400 font-normal ml-1">(auto, read-only after creation)</span>}
          </label>
          <input
            id={`cp-slug-${formId}`}
            type="text"
            value={slug}
            onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }}
            placeholder="ollama"
            readOnly={!isNew}
            className={`w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${!isNew ? 'opacity-60 cursor-default' : ''}`}
          />
        </div>
      </div>

      <div>
        <label htmlFor={`cp-baseurl-${formId}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Base URL <span className="text-red-500">*</span>
        </label>
        <input
          id={`cp-baseurl-${formId}`}
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="http://localhost:11434/v1"
          aria-describedby={baseUrlHintId}
          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <p id={baseUrlHintId} className="text-xs text-amber-600 dark:text-amber-400 mt-1">
          Polyphon will send API keys to this URL. Only configure endpoints you trust.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`cp-apikey-${formId}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            API key env var <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            id={`cp-apikey-${formId}`}
            type="text"
            value={apiKeyEnvVar}
            onChange={(e) => setApiKeyEnvVar(e.target.value)}
            placeholder="MY_OLLAMA_KEY"
            aria-describedby={apiKeyHintId}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p id={apiKeyHintId} className="text-xs text-gray-400 mt-1">
            Your API key is read from this env var. It is never stored by Polyphon.
          </p>
        </div>
        <div>
          <label htmlFor={`cp-model-${formId}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Default model
          </label>
          <input
            id={`cp-model-${formId}`}
            type="text"
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            placeholder="llama3.2"
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-600 dark:text-red-400 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function CustomProviderCard({
  cp,
  onEdit,
  onDelete,
}: {
  cp: CustomProviderWithStatus;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-5 py-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{cp.name}</span>
            <span className="text-xs text-gray-400 font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{cp.slug}</span>
          </div>
          <div className="font-mono text-xs text-gray-500 dark:text-gray-400 mt-0.5">{cp.baseUrl}</div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            aria-label={`Edit ${cp.name}`}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <Pencil size={14} strokeWidth={1.75} />
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-red-600 dark:text-red-400">Delete?</span>
              <button
                onClick={() => { onDelete(); setConfirmDelete(false); }}
                className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium px-1"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-1"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              aria-label={`Delete ${cp.name}`}
              className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      <CustomProviderApiKeyBadge cp={cp} />
    </div>
  );
}

function CustomProvidersSection() {
  const {
    customProviders,
    createCustomProvider,
    updateCustomProvider,
    deleteCustomProvider,
  } = useSettingsStore();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingProvider = editingId ? customProviders.find((cp) => cp.id === editingId) : null;

  return (
    <div className="space-y-4">
      {customProviders.map((cp) =>
        editingId === cp.id ? (
          <div key={cp.id} className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 p-5">
            <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide mb-3">
              Edit Provider
            </div>
            <CustomProviderForm
              initial={editingProvider ?? undefined}
              isNew={false}
              onSave={async (data) => {
                await updateCustomProvider(cp.id, data);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          </div>
        ) : (
          <CustomProviderCard
            key={cp.id}
            cp={cp}
            onEdit={() => { setEditingId(cp.id); setShowForm(false); }}
            onDelete={() => deleteCustomProvider(cp.id)}
          />
        ),
      )}

      {showForm ? (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 p-5">
          <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide mb-3">
            Add Custom Provider
          </div>
          <CustomProviderForm
            isNew
            onSave={async (data) => {
              await createCustomProvider(data);
              setShowForm(false);
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      ) : (
        <button
          onClick={() => { setShowForm(true); setEditingId(null); }}
          className="w-full py-2.5 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-400 dark:hover:border-gray-600 transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={16} strokeWidth={1.75} />
          Add Custom Provider
        </button>
      )}
    </div>
  );
}

// ── Tones Section ────────────────────────────────────────────────────────────

function ToneCard({
  tone,
  onEdit,
  onDelete,
}: {
  tone: ToneDefinition;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-5 py-4 space-y-1">
      <div className="flex items-start justify-between">
        <div>
          <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{tone.name}</span>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{tone.description}</div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            aria-label={`Edit ${tone.name}`}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <Pencil size={14} strokeWidth={1.75} />
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-red-600 dark:text-red-400">Delete?</span>
              <button
                onClick={() => { onDelete(); setConfirmDelete(false); }}
                className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium px-1"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-1"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              aria-label={`Delete ${tone.name}`}
              className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ToneForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: ToneDefinition;
  onSave: (data: { name: string; description: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formId = initial?.id ?? 'new';
  const nameId = `tone-name-${formId}`;
  const descId = `tone-desc-${formId}`;

  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return; }
    if (name.length > 50) { setError('Name must be 50 characters or fewer'); return; }
    if (!description.trim()) { setError('Description is required'); return; }
    setError(null);
    setSaving(true);
    try {
      await onSave({ name: name.trim(), description: description.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={nameId} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Name <span className="text-red-500">*</span>
          <span className="text-gray-400 font-normal ml-1">({name.length}/50)</span>
        </label>
        <input
          id={nameId}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          placeholder="e.g. Motivational"
          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label htmlFor={descId} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Description <span className="text-red-500">*</span>
        </label>
        <textarea
          id={descId}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Describe the tone for voices…"
          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
      </div>
      {error && (
        <div className="text-xs text-red-600 dark:text-red-400 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-3 py-2">
          {error}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function TonesSection() {
  const { tones, createTone, updateTone, deleteTone } = useSettingsStore();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingTone = editingId ? tones.find((t) => t.id === editingId) : null;

  return (
    <div className="space-y-3">
      {tones.map((tone) =>
        editingId === tone.id ? (
          <div key={tone.id} className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 p-5">
            <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide mb-3">
              Edit Tone
            </div>
            <ToneForm
              initial={editingTone ?? undefined}
              onSave={async (data) => {
                await updateTone(tone.id, data);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          </div>
        ) : (
          <ToneCard
            key={tone.id}
            tone={tone}
            onEdit={() => { setEditingId(tone.id); setShowForm(false); }}
            onDelete={() => deleteTone(tone.id)}
          />
        ),
      )}

      {showForm ? (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 p-5">
          <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide mb-3">
            Add Tone
          </div>
          <ToneForm
            onSave={async (data) => {
              await createTone(data);
              setShowForm(false);
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      ) : (
        <button
          onClick={() => { setShowForm(true); setEditingId(null); }}
          className="w-full py-2.5 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-400 dark:hover:border-gray-600 transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={16} strokeWidth={1.75} />
          Add Tone
        </button>
      )}
    </div>
  );
}

// ── System Prompts Section ───────────────────────────────────────────────────

function SystemPromptTemplateCard({
  template,
  onEdit,
  onDelete,
}: {
  template: SystemPromptTemplate;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const preview = template.content.length > 120 ? template.content.slice(0, 120) + '…' : template.content;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-5 py-4 space-y-2">
      <div className="flex items-start justify-between">
        <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{template.name}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            aria-label={`Edit ${template.name}`}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <Pencil size={14} strokeWidth={1.75} />
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-red-600 dark:text-red-400">Delete?</span>
              <button
                onClick={() => { onDelete(); setConfirmDelete(false); }}
                className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium px-1"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-1"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              aria-label={`Delete ${template.name}`}
              className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 font-mono whitespace-pre-line">{preview}</div>
    </div>
  );
}

function SystemPromptTemplateForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: SystemPromptTemplate;
  onSave: (data: { name: string; content: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formId = initial?.id ?? 'new';
  const nameId = `spt-name-${formId}`;
  const contentId = `spt-content-${formId}`;

  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return; }
    if (name.length > 100) { setError('Name must be 100 characters or fewer'); return; }
    if (!content.trim()) { setError('Content is required'); return; }
    setError(null);
    setSaving(true);
    try {
      await onSave({ name: name.trim(), content: content.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={nameId} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Name <span className="text-red-500">*</span>
          <span className="text-gray-400 font-normal ml-1">({name.length}/100)</span>
        </label>
        <input
          id={nameId}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          placeholder="e.g. Code Review Assistant"
          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label htmlFor={contentId} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Content <span className="text-red-500">*</span>
        </label>
        <textarea
          id={contentId}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="You are a careful code reviewer…"
          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
      </div>
      {error && (
        <div className="text-xs text-red-600 dark:text-red-400 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-3 py-2">
          {error}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function SystemPromptsSection() {
  const { systemPromptTemplates, createSystemPromptTemplate, updateSystemPromptTemplate, deleteSystemPromptTemplate } = useSettingsStore();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingTemplate = editingId ? systemPromptTemplates.find((t) => t.id === editingId) : null;

  return (
    <div className="space-y-3">
      {systemPromptTemplates.map((template) =>
        editingId === template.id ? (
          <div key={template.id} className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 p-5">
            <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide mb-3">
              Edit Template
            </div>
            <SystemPromptTemplateForm
              initial={editingTemplate ?? undefined}
              onSave={async (data) => {
                await updateSystemPromptTemplate(template.id, data);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          </div>
        ) : (
          <SystemPromptTemplateCard
            key={template.id}
            template={template}
            onEdit={() => { setEditingId(template.id); setShowForm(false); }}
            onDelete={() => deleteSystemPromptTemplate(template.id)}
          />
        ),
      )}

      {showForm ? (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 p-5">
          <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide mb-3">
            Add Template
          </div>
          <SystemPromptTemplateForm
            onSave={async (data) => {
              await createSystemPromptTemplate(data);
              setShowForm(false);
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      ) : (
        <button
          onClick={() => { setShowForm(true); setEditingId(null); }}
          className="w-full py-2.5 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-400 dark:hover:border-gray-600 transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={16} strokeWidth={1.75} />
          Add Template
        </button>
      )}
    </div>
  );
}

// ── Logs Section ─────────────────────────────────────────────────────────────

// Classify a log line by level for colorization
function classifyLogLine(line: string): 'error' | 'warn' | 'info' | 'debug' | 'default' {
  const upper = line.toUpperCase();
  if (upper.includes('[ERROR]')) return 'error';
  if (upper.includes('[WARN]')) return 'warn';
  if (upper.includes('[INFO]')) return 'info';
  if (upper.includes('[DEBUG]') || upper.includes('[VERBOSE]')) return 'debug';
  return 'default';
}

const LOG_LINE_COLORS: Record<string, string> = {
  error: 'text-red-500 dark:text-red-400',
  warn:  'text-amber-500 dark:text-amber-400',
  info:  'text-sky-600 dark:text-sky-400',
  debug: 'text-gray-400 dark:text-gray-500',
  default: 'text-gray-600 dark:text-gray-400',
};

function FilePathChip({ label, filePath }: { label: string; filePath: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(filePath).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">{label}</span>
      <div className="flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 px-3 py-2">
        <span className="font-mono text-xs text-gray-600 dark:text-gray-400 truncate flex-1 min-w-0">{filePath}</span>
        <button
          onClick={handleCopy}
          title="Copy path"
          className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
        >
          {copied
            ? <Check size={13} strokeWidth={2} className="text-green-500" />
            : <Copy size={13} strokeWidth={1.75} />
          }
        </button>
      </div>
    </div>
  );
}

function LogsSection() {
  const [lines, setLines] = useState<string[]>([]);
  const [debugEnabled, setDebugEnabledState] = useState(false);
  const [paths, setPaths] = useState<{ appLog: string; debugLog: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      window.polyphon.logs.getRecent(),
      window.polyphon.logs.getDebugEnabled(),
      window.polyphon.logs.getPaths(),
    ]).then(([recentLines, debugOn, logPaths]) => {
      setLines(recentLines);
      setDebugEnabledState(debugOn);
      setPaths(logPaths);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView();
  }, [lines]);

  async function handleToggleDebug(enabled: boolean) {
    await window.polyphon.logs.setDebugEnabled(enabled);
    setDebugEnabledState(enabled);
  }

  async function handleRefresh() {
    setRefreshing(true);
    const recentLines = await window.polyphon.logs.getRecent();
    setLines(recentLines);
    setRefreshing(false);
  }

  async function handleExport() {
    setExporting(true);
    try {
      await window.polyphon.logs.export();
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* App log file path */}
      {paths && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <FilePathChip label="Application log" filePath={paths.appLog} />
        </div>
      )}

      {/* Log viewer */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/30">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400/60 dark:bg-red-500/40" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400/60 dark:bg-amber-500/40" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-400/60 dark:bg-green-500/40" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 ml-1">polyphon.log</span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-40 transition-colors"
          >
            <RefreshCw size={11} strokeWidth={2} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
        <div className="h-80 overflow-y-auto bg-[#0d1117] dark:bg-[#0a0e14] p-3 font-mono text-xs leading-5">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 size={12} strokeWidth={1.75} className="animate-spin" />
              Loading…
            </div>
          ) : lines.length === 0 ? (
            <div className="text-gray-500">No log entries found.</div>
          ) : (
            lines.map((line, i) => {
              const level = classifyLogLine(line);
              return (
                <div key={i} className={`${LOG_LINE_COLORS[level]} whitespace-pre-wrap break-all py-px`}>
                  {line}
                </div>
              );
            })
          )}
          <div ref={logEndRef} />
        </div>
        {/* Legend */}
        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-4 bg-gray-50/50 dark:bg-gray-800/30">
          {(['error', 'warn', 'info', 'debug'] as const).map((level) => (
            <span key={level} className={`flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide ${LOG_LINE_COLORS[level]}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {level}
            </span>
          ))}
        </div>
      </div>

      {/* Debug logging */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="p-4 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Debug logging</span>
              {debugEnabled && (
                <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">Captures verbose output including all log levels.</p>
          </div>
          <Toggle checked={debugEnabled} onChange={handleToggleDebug} />
        </div>

        {debugEnabled && paths && (
          <div className="px-4 pb-4 space-y-3">
            <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
              <FilePathChip label="Debug log" filePath={paths.debugLog} />
            </div>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Download size={14} strokeWidth={1.75} />
              {exporting ? 'Exporting…' : 'Export'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section nav ─────────────────────────────────────────────────────────────

type Section = 'conductor' | 'tones' | 'system-prompts' | 'providers' | 'encryption' | 'general' | 'logs' | 'about';

const SECTION_ITEMS: { id: Section; label: string; Icon: React.ElementType }[] = [
  { id: 'conductor', label: 'Conductor', Icon: Wand2 },
  { id: 'tones', label: 'Tones', Icon: Music2 },
  { id: 'system-prompts', label: 'System Prompts', Icon: FileText },
  { id: 'providers', label: 'Providers', Icon: Plug },
  { id: 'encryption', label: 'Encryption', Icon: Lock },
  { id: 'general', label: 'General', Icon: SlidersHorizontal },
  { id: 'logs', label: 'Logs', Icon: ScrollText },
  { id: 'about', label: 'About', Icon: Info },
];

function SectionNav({
  active,
  onChange,
}: {
  active: Section;
  onChange: (s: Section) => void;
}) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const currentIndex = SECTION_ITEMS.findIndex((item) => item.id === active);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % SECTION_ITEMS.length;
      const nextItem = SECTION_ITEMS[nextIndex];
      if (nextItem) { onChange(nextItem.id); tabRefs.current[nextIndex]?.focus(); }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + SECTION_ITEMS.length) % SECTION_ITEMS.length;
      const prevItem = SECTION_ITEMS[prevIndex];
      if (prevItem) { onChange(prevItem.id); tabRefs.current[prevIndex]?.focus(); }
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Settings sections"
      className="space-y-0.5"
      onKeyDown={handleKeyDown}
    >
      {SECTION_ITEMS.map(({ id, label, Icon }, index) => (
        <button
          key={id}
          ref={(el) => { tabRefs.current[index] = el; }}
          role="tab"
          aria-selected={active === id}
          aria-controls={`${id}-panel`}
          id={`tab-${id}`}
          tabIndex={active === id ? 0 : -1}
          onClick={() => onChange(id)}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
            active === id
              ? 'bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 font-medium'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <Icon size={14} strokeWidth={1.75} />
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Main Settings page ──────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<Section>('conductor');
  const { load, loading, error } = useSettingsStore();

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Section sidebar */}
      <div className="w-48 shrink-0 border-r border-gray-200 dark:border-gray-800 px-3 py-6">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 mb-3">
          Settings
        </div>
        <SectionNav active={activeSection} onChange={setActiveSection} />
      </div>

      {/* Section content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {loading && (
          <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
            Loading…
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        {!loading && activeSection === 'tones' && (
          <div
            role="tabpanel"
            id="tones-panel"
            aria-labelledby="tab-tones"
            tabIndex={0}
            className="max-w-2xl space-y-6"
          >
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Tones</h2>
              <p className="text-sm text-gray-500 mt-1">
                Manage tones for voices. Built-in tones can be edited or deleted.
              </p>
            </div>
            <TonesSection />
          </div>
        )}

        {!loading && activeSection === 'system-prompts' && (
          <div
            role="tabpanel"
            id="system-prompts-panel"
            aria-labelledby="tab-system-prompts"
            tabIndex={0}
            className="max-w-2xl space-y-6"
          >
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">System Prompts</h2>
              <p className="text-sm text-gray-500 mt-1">
                Save reusable system prompt templates and attach them to voices in compositions.
              </p>
            </div>
            <SystemPromptsSection />
          </div>
        )}

        {!loading && activeSection === 'providers' && (
          <div
            role="tabpanel"
            id="providers-panel"
            aria-labelledby="tab-providers"
            tabIndex={0}
            className="max-w-2xl space-y-4"
          >
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Voice Providers</h2>
              <p className="text-sm text-gray-500 mt-1">
                Configure the providers available for use in compositions.
              </p>
            </div>
            {SETTINGS_PROVIDERS.map((provider) => (
              <ProviderCard key={provider} provider={provider} />
            ))}
            <div className="pt-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
                Custom Providers
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Add any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, custom proxies).
              </p>
              <CustomProvidersSection />
            </div>
          </div>
        )}

        {!loading && activeSection === 'conductor' && (
          <div
            role="tabpanel"
            id="conductor-panel"
            aria-labelledby="tab-conductor"
            tabIndex={0}
            className="max-w-2xl space-y-6"
          >
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Conductor</h2>
              <p className="text-sm text-gray-500 mt-1">Personalise how voices address you and their conversation style.</p>
            </div>
            <ConductorProfile />
          </div>
        )}

        {!loading && activeSection === 'encryption' && (
          <div
            role="tabpanel"
            id="encryption-panel"
            aria-labelledby="tab-encryption"
            tabIndex={0}
            className="max-w-2xl space-y-6"
          >
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Encryption</h2>
              <p className="text-sm text-gray-500 mt-1">Manage at-rest encryption of your local data.</p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3 text-xs text-gray-600 dark:text-gray-400">
              <EncryptionSection />
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                <div className="space-y-1.5">
                  <p className="font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide" style={{ fontSize: '10px' }}>Encrypted</p>
                  <ul className="space-y-1">
                    {['Message content', 'Your profile (name, pronouns, context, avatar)', 'Voice system prompts', 'Custom provider URLs', 'CLI voice commands and arguments', 'Tone descriptions', 'System prompt template content'].map((item) => (
                      <li key={item} className="flex items-center gap-1.5"><Check size={12} strokeWidth={2.5} className="shrink-0 text-green-500" />{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-1.5">
                  <p className="font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide" style={{ fontSize: '10px' }}>Not encrypted</p>
                  <ul className="space-y-1">
                    {['Session and composition names', 'Voice display names', 'Custom provider names', 'Template and tone names', 'Timestamps and counts'].map((item) => (
                      <li key={item} className="flex items-center gap-1.5"><X size={12} strokeWidth={2.5} className="shrink-0 text-red-500" />{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="text-gray-400 dark:text-gray-500 pt-1">Names and labels are left unencrypted so they can be queried directly in the database — for example, to list and search your sessions and compositions. They contain no message content or credentials.</p>
            </div>
          </div>
        )}

        {!loading && activeSection === 'general' && (
          <div
            role="tabpanel"
            id="general-panel"
            aria-labelledby="tab-general"
            tabIndex={0}
            className="max-w-2xl space-y-6"
          >
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">General</h2>
              <p className="text-sm text-gray-500 mt-1">App-wide preferences.</p>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Appearance</div>
                  <div className="text-xs text-gray-500 mt-0.5">Choose your preferred color theme.</div>
                </div>
                <ThemeSelector />
              </div>
            </div>
          </div>
        )}

        {!loading && activeSection === 'logs' && (
          <div
            role="tabpanel"
            id="logs-panel"
            aria-labelledby="tab-logs"
            tabIndex={0}
            className="max-w-2xl space-y-6"
          >
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Logs</h2>
              <p className="text-sm text-gray-500 mt-1">View application logs and manage debug output.</p>
            </div>
            <LogsSection />
          </div>
        )}

        {activeSection === 'about' && (
          <div
            role="tabpanel"
            id="about-panel"
            aria-labelledby="tab-about"
            tabIndex={0}
            className="max-w-2xl space-y-6"
          >
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">About</h2>
            </div>
            <AboutPage />
          </div>
        )}
      </div>
    </div>
  );
}
