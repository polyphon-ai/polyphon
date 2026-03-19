import React, { useState } from 'react';
import { Plus, X, Check } from 'lucide-react';
import type { CompositionVoice, CustomProviderWithStatus } from '../../../shared/types';
import {
  PROVIDER_METADATA,
  PROVIDER_NAMES,
  SETTINGS_PROVIDERS,
  PRESET_COLORS,
  PRESET_COLOR_NAMES,
  type VoiceType,
} from '../../../shared/constants';
import { useSettingsStore } from '../../store/settingsStore';
import ProviderLogo from '../Shared/ProviderLogo';

export interface VoiceSelectorProps {
  onSelect: (voice: Omit<CompositionVoice, 'id' | 'compositionId' | 'order'>) => void;
  voices?: CompositionVoice[];
}

export default function VoiceSelector({
  onSelect,
  voices = [],
}: VoiceSelectorProps): React.JSX.Element {
  const { providerConfigs, modelFetchStates, customProviders, customProviderModelFetchStates, tones, systemPromptTemplates, cliTestStates, providerStatuses, userProfile } = useSettingsStore();

  // Colors already claimed: conductor's global color + colors used by existing voices in this composition
  const excludedColors = new Set<string>([
    ...(userProfile.conductorColor ? [userProfile.conductorColor] : []),
    ...voices.map((v) => v.color),
  ]);

  function firstAvailableColor(preferred: string): string {
    if (!excludedColors.has(preferred)) return preferred;
    return PRESET_COLORS.find((c) => !excludedColors.has(c)) ?? preferred;
  }

  function isApiAvailable(p: string): boolean {
    return providerStatuses[p]?.apiKeyStatus?.status !== 'none';
  }
  function isCliAvailable(p: string): boolean {
    const state = cliTestStates[p];
    return state === undefined || state.status === 'idle' || state.status === 'testing' || state.status === 'success';
  }

  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedCustomProvider, setSelectedCustomProvider] = useState<CustomProviderWithStatus | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [nameError, setNameError] = useState('');
  const [color, setColor] = useState<string>(PRESET_COLORS[0] ?? '');
  const [voiceType, setVoiceType] = useState<VoiceType>('api');
  const [model, setModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [toneOverride, setToneOverride] = useState('');
  const [systemPromptTemplateId, setSystemPromptTemplateId] = useState<string | undefined>(undefined);

  // A provider shows up if at least one of its types is enabled
  const enabledProviders = SETTINGS_PROVIDERS.filter(
    (p) => Object.values(providerConfigs[p] ?? {}).some((cfg) => cfg?.enabled),
  );

  function openProvider(provider: string) {
    const meta = PROVIDER_METADATA[provider];
    const typeConfigs = providerConfigs[provider] ?? {};
    // Default to the first enabled type, preferring API
    const defaultType = (['api', 'cli'] as VoiceType[]).find((t) => typeConfigs[t]?.enabled)
      ?? meta?.defaultVoiceType ?? 'api';
    const apiConfig = typeConfigs.api;
    setSelectedCustomProvider(null);
    setSelectedProvider(provider);
    setDisplayName(meta?.name ?? provider);
    setColor(firstAvailableColor(meta?.color ?? PRESET_COLORS[0] ?? ''));
    setVoiceType(defaultType);
    setModel(apiConfig?.defaultModel ?? meta?.defaultModels[0] ?? '');
    setSystemPrompt('');
    setToneOverride('');
    setSystemPromptTemplateId(undefined);
  }

  function openCustomProvider(cp: CustomProviderWithStatus) {
    setSelectedProvider(null);
    setSelectedCustomProvider(cp);
    setDisplayName(cp.name);
    setColor(firstAvailableColor(PRESET_COLORS[0] ?? ''));
    setModel(cp.defaultModel ?? '');
    setSystemPrompt('');
    setToneOverride('');
    setSystemPromptTemplateId(undefined);
  }

  function handleAdd() {
    const resolvedTone = toneOverride || undefined;
    const resolvedName = displayName.trim() || (selectedCustomProvider?.name ?? (selectedProvider ? (PROVIDER_METADATA[selectedProvider]?.name ?? selectedProvider) : ''));
    const isDuplicate = voices.some(
      (v) => v.displayName.trim().toLowerCase() === resolvedName.toLowerCase(),
    );
    if (isDuplicate) {
      setNameError(`A voice named "${resolvedName}" already exists in this composition.`);
      return;
    }

    if (selectedCustomProvider) {
      onSelect({
        provider: PROVIDER_NAMES.OPENAI_COMPAT,
        displayName: displayName.trim() || selectedCustomProvider.name,
        color,
        avatarIcon: 'custom',
        model: model || selectedCustomProvider.defaultModel || undefined,
        customProviderId: selectedCustomProvider.id,
        systemPrompt: systemPrompt.trim() || undefined,
        toneOverride: resolvedTone,
        systemPromptTemplateId,
      });
      setSelectedCustomProvider(null);
      setDisplayName('');
      setNameError('');
      setSystemPrompt('');
      setToneOverride('');
      setSystemPromptTemplateId(undefined);
      return;
    }

    if (!selectedProvider) return;
    const meta = PROVIDER_METADATA[selectedProvider];
    const config = providerConfigs[selectedProvider]?.[voiceType];
    const isCli = voiceType === 'cli';

    onSelect({
      provider: selectedProvider,
      displayName: resolvedName,
      color,
      avatarIcon: selectedProvider ?? '',
      ...(isCli
        ? {
            cliCommand:
              config?.cliCommand ?? meta?.defaultCliCommand ?? undefined,
          }
        : { model: model || undefined }),
      systemPrompt: systemPrompt.trim() || undefined,
      toneOverride: resolvedTone,
      systemPromptTemplateId,
    });

    setSelectedProvider(null);
    setDisplayName('');
    setNameError('');
    setSystemPrompt('');
    setToneOverride('');
    setSystemPromptTemplateId(undefined);
  }

  const availableModels: readonly string[] = selectedCustomProvider
    ? (customProviderModelFetchStates[selectedCustomProvider.id]?.models?.length ?? 0) > 0
      ? customProviderModelFetchStates[selectedCustomProvider.id]!.models
      : selectedCustomProvider.defaultModel ? [selectedCustomProvider.defaultModel] : []
    : selectedProvider
      ? (modelFetchStates[selectedProvider]?.models?.length ?? 0) > 0
        ? modelFetchStates[selectedProvider]!.models
        : (PROVIDER_METADATA[selectedProvider]?.defaultModels ?? [])
      : [];

  const hasAnyProvider = enabledProviders.length > 0 || customProviders.length > 0;

  if (!hasAnyProvider) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center text-sm text-gray-400 dark:text-gray-600">
        Enable providers in{' '}
        <span className="font-medium text-gray-500">Settings</span> to add
        voices.
      </div>
    );
  }

  const isFormOpen = selectedProvider !== null || selectedCustomProvider !== null;

  return (
    <div className="space-y-3">
      {/* Provider grid */}
      <div className="grid grid-cols-2 gap-2">
        {enabledProviders.map((provider) => {
          const meta = PROVIDER_METADATA[provider];
          const isSelected = selectedProvider === provider;
          const canEnable = isApiAvailable(provider) || isCliAvailable(provider);
          return (
            <button
              key={provider}
              disabled={!canEnable}
              onClick={() =>
                isSelected ? setSelectedProvider(null) : openProvider(provider)
              }
              aria-label={`Select ${provider} provider`}
              className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border-2 transition-all text-left ${
                !canEnable
                  ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 opacity-50 cursor-not-allowed'
                  : isSelected
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <span
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                style={{ backgroundColor: `${isSelected ? color : (meta?.color ?? '#6366f1')}20` }}
              >
                <ProviderLogo provider={provider} size={18} color={isSelected ? color : undefined} />
              </span>
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {meta?.name ?? provider}
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-600">
                  {PROVIDER_METADATA[provider]?.supportedTypes
                    .filter((t) => providerConfigs[provider]?.[t]?.enabled)
                    .map((t) => t.toUpperCase())
                    .join(' · ')}
                </div>
              </div>
            </button>
          );
        })}
        {customProviders.map((cp) => {
          const isSelected = selectedCustomProvider?.id === cp.id;
          const addedColor = voices.find((v) => v.customProviderId === cp.id)?.color;
          const idleColor = addedColor ?? '#6b7280';
          return (
            <button
              key={cp.id}
              onClick={() =>
                isSelected ? setSelectedCustomProvider(null) : openCustomProvider(cp)
              }
              aria-label={`Select ${cp.name} provider`}
              className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border-2 transition-all text-left ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <span
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                style={{ backgroundColor: `${isSelected ? color : idleColor}20` }}
              >
                <ProviderLogo provider={cp.slug} size={18} color={isSelected ? color : idleColor} />
              </span>
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {cp.name}
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-600">CUSTOM · API</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Voice config form */}
      {isFormOpen && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 p-4 space-y-4">
          <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide">
            Configure Voice
          </div>

          {/* Display name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              Display name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => { setDisplayName(e.target.value); setNameError(''); }}
              className={`w-full bg-white dark:bg-gray-800 border rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${nameError ? 'border-red-400 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'}`}
              placeholder="Display name"
            />
            {nameError && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{nameError}</p>
            )}
          </div>

          {/* Color picker */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              Color
            </label>
            <div className="flex gap-2">
              {PRESET_COLORS.map((c) => {
                const isExcluded = excludedColors.has(c);
                return (
                  <button
                    key={c}
                    onClick={() => !isExcluded && setColor(c)}
                    disabled={isExcluded}
                    title={isExcluded ? 'Already in use' : (PRESET_COLOR_NAMES[c] ?? c)}
                    aria-label={`Voice color: ${PRESET_COLOR_NAMES[c] ?? c}${isExcluded ? ' (already in use)' : ''}`}
                    className={`w-6 h-6 rounded-full transition-transform ${
                      isExcluded
                        ? 'opacity-25 cursor-not-allowed'
                        : color === c
                          ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110'
                          : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                );
              })}
            </div>
          </div>

          {/* Voice type — only shown when multiple types are enabled for this provider */}
          {!selectedCustomProvider && selectedProvider && (() => {
            const enabledTypes = PROVIDER_METADATA[selectedProvider]?.supportedTypes.filter(
              (t) => providerConfigs[selectedProvider]?.[t]?.enabled,
            ) ?? [];
            if (enabledTypes.length <= 1) return null;
            return (
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                  Voice type
                </label>
                <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 w-fit">
                  {enabledTypes.map((t) => (
                    <button
                      key={t}
                      onClick={() => setVoiceType(t)}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        voiceType === t
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {t.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Model selector (API mode only) */}
          {voiceType === 'api' && availableModels.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {availableModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Template selector */}
          {systemPromptTemplates.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                System prompt template{' '}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={systemPromptTemplateId ?? ''}
                  onChange={(e) => {
                    const id = e.target.value || undefined;
                    setSystemPromptTemplateId(id);
                    if (id) {
                      const tmpl = systemPromptTemplates.find((t) => t.id === id);
                      if (tmpl) setSystemPrompt(tmpl.content);
                    }
                  }}
                  className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">No template (inline)</option>
                  {systemPromptTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                {systemPromptTemplateId && (
                  <span className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 px-2 py-1 rounded-lg whitespace-nowrap">
                    Template attached
                  </span>
                )}
              </div>
            </div>
          )}

          {/* System prompt */}
          <div>
            <label
              htmlFor="voice-system-prompt"
              className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5"
            >
              System prompt{' '}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="voice-system-prompt"
              value={systemPrompt}
              onChange={(e) => {
                setSystemPrompt(e.target.value);
                // Editing the textarea detaches from the template (goes inline)
                if (systemPromptTemplateId) setSystemPromptTemplateId(undefined);
              }}
              rows={2}
              aria-describedby="voice-system-prompt-hint"
              className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              placeholder="Optional per-voice system prompt…"
            />
            <p
              id="voice-system-prompt-hint"
              className="mt-1 text-xs text-gray-400 dark:text-gray-600"
            >
              Editing this field detaches the voice from any selected template.
            </p>
          </div>

          {/* Tone override */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              Tone{' '}
              <span className="text-gray-400 font-normal">(optional — overrides global default)</span>
            </label>
            <select
              value={toneOverride}
              onChange={(e) => setToneOverride(e.target.value)}
              className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Use conductor default</option>
              {tones.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.description}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAdd}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={14} strokeWidth={1.75} />
              Add Voice
            </button>
            <button
              onClick={() => { setSelectedProvider(null); setSelectedCustomProvider(null); setNameError(''); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors"
            >
              <X size={14} strokeWidth={1.75} />
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
