import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { CompositionVoice, CustomProviderWithStatus } from '../../../shared/types';
import {
  PROVIDER_METADATA,
  PROVIDER_NAMES,
  SETTINGS_PROVIDERS,
  PRESET_COLORS,
  type VoiceType,
} from '../../../shared/constants';
import { useSettingsStore } from '../../store/settingsStore';
import ProviderLogo from '../Shared/ProviderLogo';
import { VoiceConfigFields } from './VoiceConfigFields';

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
  const [yoleModeOverride, setYoleModeOverride] = useState<boolean | null>(null);

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
    setYoleModeOverride(null);
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
    setYoleModeOverride(null);
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
            yoleModeOverride,
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
    setYoleModeOverride(null);
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

          {(() => {
            const enabledTypes = selectedProvider
              ? (PROVIDER_METADATA[selectedProvider]?.supportedTypes.filter(
                  (t) => providerConfigs[selectedProvider]?.[t]?.enabled,
                ) as VoiceType[] ?? [])
              : [];
            return (
              <VoiceConfigFields
                displayName={displayName}
                color={color}
                voiceType={voiceType}
                model={model}
                systemPrompt={systemPrompt}
                toneOverride={toneOverride}
                systemPromptTemplateId={systemPromptTemplateId}
                enabledTools={[]}
                setDisplayName={setDisplayName}
                setColor={setColor}
                setVoiceType={setVoiceType}
                setModel={setModel}
                setSystemPrompt={setSystemPrompt}
                setToneOverride={setToneOverride}
                setSystemPromptTemplateId={setSystemPromptTemplateId}
                setEnabledTools={() => {}}
                nameError={nameError}
                setNameError={setNameError}
                yoleModeOverride={yoleModeOverride}
                setYoleModeOverride={setYoleModeOverride}
                providerYoloDefault={
                  selectedProvider && voiceType === 'cli'
                    ? (providerConfigs[selectedProvider]?.cli?.yoloMode ?? false)
                    : undefined
                }
                isCli={voiceType === 'cli'}
                enabledTypes={enabledTypes}
                canToggleType={enabledTypes.length > 1}
                lockedBecauseSettings={false}
                hideVoiceTypeToggle={!!selectedCustomProvider || !selectedProvider}
                availableModels={availableModels}
                tones={tones}
                systemPromptTemplates={systemPromptTemplates}
                excludedColors={excludedColors}
                showHelpTooltips={false}
                showTools={false}
                showSystemPromptHint
                systemPromptRows={2}
                showTemplateAttachedBadge
                displayNamePlaceholder="Display name"
              />
            );
          })()}

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
