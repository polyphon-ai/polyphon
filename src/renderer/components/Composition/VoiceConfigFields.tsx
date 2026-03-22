import React from 'react';
import { Lock, TriangleAlert, FileText, FileEdit, FolderOpen, Terminal, Search } from 'lucide-react';
import { AVAILABLE_TOOLS, type VoiceType } from '../../../shared/constants';
import type { ToneDefinition, SystemPromptTemplate } from '../../../shared/types';
import { ColorPicker } from '../Shared';
import { HelpTooltip } from '../Shared/HelpTooltip';

const TOOL_ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  read_file: FileText,
  write_file: FileEdit,
  list_directory: FolderOpen,
  run_command: Terminal,
  search_files: Search,
};

export interface VoiceConfigFieldsProps {
  // State values
  displayName: string;
  color: string;
  voiceType: VoiceType;
  model: string;
  systemPrompt: string;
  toneOverride: string;
  systemPromptTemplateId: string | undefined;
  enabledTools: string[];

  // Setters
  setDisplayName: (v: string) => void;
  setColor: (v: string) => void;
  setVoiceType: (v: VoiceType) => void;
  setModel: (v: string) => void;
  setSystemPrompt: (v: string) => void;
  setToneOverride: (v: string) => void;
  setSystemPromptTemplateId: (v: string | undefined) => void;
  setEnabledTools: (v: string[] | ((prev: string[]) => string[])) => void;

  // Validation
  nameError: string;
  setNameError: (v: string) => void;

  // Voice type configuration
  isCli: boolean;
  enabledTypes: VoiceType[];
  canToggleType: boolean;
  lockedBecauseSettings: boolean;
  hideVoiceTypeToggle?: boolean;

  // Available data
  availableModels: readonly string[];
  tones: ToneDefinition[];
  systemPromptTemplates: SystemPromptTemplate[];
  excludedColors: Set<string>;

  // UI variant options
  showHelpTooltips?: boolean;
  showTools?: boolean;
  showSystemPromptHint?: boolean;
  systemPromptRows?: number;
  showTemplateAttachedBadge?: boolean;
  displayNamePlaceholder?: string;
}

export function VoiceConfigFields({
  displayName,
  color,
  voiceType,
  model,
  systemPrompt,
  toneOverride,
  systemPromptTemplateId,
  enabledTools,
  setDisplayName,
  setColor,
  setVoiceType,
  setModel,
  setSystemPrompt,
  setToneOverride,
  setSystemPromptTemplateId,
  setEnabledTools,
  nameError,
  setNameError,
  isCli,
  enabledTypes,
  canToggleType,
  lockedBecauseSettings,
  hideVoiceTypeToggle = false,
  availableModels,
  tones,
  systemPromptTemplates,
  excludedColors,
  showHelpTooltips = false,
  showTools = false,
  showSystemPromptHint = false,
  systemPromptRows = 3,
  showTemplateAttachedBadge = false,
  displayNamePlaceholder,
}: VoiceConfigFieldsProps): React.JSX.Element {
  return (
    <>
      {/* Display name */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
          Display name
          {showHelpTooltips && (
            <HelpTooltip text="The name shown next to this voice's messages in the conversation." />
          )}
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => { setDisplayName(e.target.value); setNameError(''); }}
          placeholder={displayNamePlaceholder}
          className={`w-full bg-white dark:bg-gray-800 border rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${nameError ? 'border-red-400 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'}`}
        />
        {nameError && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{nameError}</p>
        )}
      </div>

      {/* Color */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
          Color
          {showHelpTooltips && (
            <HelpTooltip text="Visually distinguishes this voice's messages in the conversation. Each voice must have a unique color." />
          )}
        </label>
        <ColorPicker value={color} onChange={setColor} excludedColors={excludedColors} />
      </div>

      {/* Voice type toggle or locked indicator */}
      {!hideVoiceTypeToggle && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
            Voice type
            {showHelpTooltips && (
              <HelpTooltip text="Whether this voice communicates via API key or a local CLI binary." />
            )}
          </label>
          {canToggleType ? (
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
          ) : showHelpTooltips ? (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <Lock size={12} strokeWidth={1.75} />
              <span>
                {lockedBecauseSettings
                  ? `${isCli ? 'CLI' : 'API'} only — enable ${isCli ? 'API' : 'CLI'} in Settings to switch`
                  : `${isCli ? 'CLI' : 'API'} only — this provider does not support the ${isCli ? 'API' : 'CLI'} type`}
              </span>
            </div>
          ) : null}
        </div>
      )}

      {/* Model selector (API voices only) */}
      {voiceType === 'api' && availableModels.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
            Model
            {showHelpTooltips && (
              <HelpTooltip text="The specific AI model this voice will use. Defaults to the provider's selected model in Settings." />
            )}
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {availableModels.map((m) => (
              <option key={m} value={m}>{m}</option>
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
            {showHelpTooltips && (
              <HelpTooltip text="Load a reusable system prompt from your saved templates. Selecting one fills in the system prompt field below." />
            )}
          </label>
          <div className={showTemplateAttachedBadge ? 'flex items-center gap-2' : undefined}>
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
              className={`${showTemplateAttachedBadge ? 'flex-1' : 'w-full'} bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500`}
            >
              <option value="">No template (inline)</option>
              {systemPromptTemplates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {showTemplateAttachedBadge && systemPromptTemplateId && (
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
          htmlFor={showSystemPromptHint ? 'voice-system-prompt' : undefined}
          className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5"
        >
          System prompt{' '}
          <span className="text-gray-400 font-normal">(optional)</span>
          {showHelpTooltips && (
            <HelpTooltip text="Instructions given to this voice at the start of every session. Sets its personality, role, or area of focus." />
          )}
        </label>
        <textarea
          id={showSystemPromptHint ? 'voice-system-prompt' : undefined}
          value={systemPrompt}
          onChange={(e) => {
            setSystemPrompt(e.target.value);
            if (systemPromptTemplateId) setSystemPromptTemplateId(undefined);
          }}
          rows={systemPromptRows}
          aria-describedby={showSystemPromptHint ? 'voice-system-prompt-hint' : undefined}
          className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          placeholder="Optional per-voice system prompt…"
        />
        {showSystemPromptHint && (
          <p
            id="voice-system-prompt-hint"
            className="mt-1 text-xs text-gray-400 dark:text-gray-600"
          >
            Editing this field detaches the voice from any selected template.
          </p>
        )}
      </div>

      {/* Tone override */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
          Tone{' '}
          <span className="text-gray-400 font-normal">(optional — overrides global default)</span>
          {showHelpTooltips && (
            <HelpTooltip text="Overrides the conductor's default tone for this voice only. Leave unset to inherit the global default." />
          )}
        </label>
        <select
          value={toneOverride}
          onChange={(e) => setToneOverride(e.target.value)}
          className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Use conductor default</option>
          {tones.map((t) => (
            <option key={t.id} value={t.id}>{t.name} — {t.description}</option>
          ))}
        </select>
      </div>

      {/* Tools (API voices only) — optional */}
      {showTools && voiceType === 'api' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1">
              Tools
              <span className="text-gray-400 dark:text-gray-600 font-normal">· filesystem access</span>
              <HelpTooltip text="Allow this voice to read or write files on your local machine. Write-capable tools can overwrite any file you have permission to modify." />
            </label>
            <button
              type="button"
              onClick={() =>
                enabledTools.length === AVAILABLE_TOOLS.length
                  ? setEnabledTools([])
                  : setEnabledTools(AVAILABLE_TOOLS.map((t) => t.name))
              }
              className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors shrink-0"
            >
              {enabledTools.length === AVAILABLE_TOOLS.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {AVAILABLE_TOOLS.map((tool) => {
              const checked = enabledTools.includes(tool.name);
              const ToolIcon = TOOL_ICONS[tool.name] ?? FileText;
              return (
                <button
                  key={tool.name}
                  type="button"
                  onClick={() => {
                    if (checked) {
                      setEnabledTools((prev) => prev.filter((n) => n !== tool.name));
                    } else {
                      setEnabledTools((prev) => [...prev, tool.name]);
                    }
                  }}
                  className={`flex flex-col gap-1 px-3 py-2.5 rounded-lg border text-left transition-all ${
                    checked
                      ? tool.isWritable
                        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700/60'
                        : 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-700/60'
                      : 'bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <ToolIcon
                        size={13}
                        strokeWidth={1.75}
                        className={
                          checked
                            ? tool.isWritable
                              ? 'text-amber-600 dark:text-amber-400 shrink-0'
                              : 'text-indigo-600 dark:text-indigo-400 shrink-0'
                            : 'text-gray-400 dark:text-gray-600 shrink-0'
                        }
                      />
                      <span
                        className={`text-xs font-medium truncate ${
                          checked
                            ? tool.isWritable
                              ? 'text-amber-700 dark:text-amber-300'
                              : 'text-indigo-700 dark:text-indigo-300'
                            : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {tool.label}
                      </span>
                    </div>
                    {tool.isWritable && (
                      <TriangleAlert size={11} strokeWidth={1.75} className="text-amber-500 dark:text-amber-400 shrink-0" />
                    )}
                  </div>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                    {tool.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Destructive tools warning */}
      {showTools && voiceType === 'api' && enabledTools.some((n) => AVAILABLE_TOOLS.find((t) => t.name === n)?.isWritable) && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 px-3 py-2.5">
          <TriangleAlert size={14} strokeWidth={1.75} className="shrink-0 mt-0.5 text-amber-500 dark:text-amber-400" />
          <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
            One or more enabled tools can modify or delete files on your machine. This voice will have that access during every session that uses this composition.
          </p>
        </div>
      )}

      {/* CLI voice filesystem access note */}
      {voiceType === 'cli' && (
        <div className="flex items-start gap-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2.5">
          <Terminal size={14} strokeWidth={1.75} className="shrink-0 mt-0.5 text-gray-400 dark:text-gray-500" />
          <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
            CLI voices run as autonomous subprocess agents with unrestricted filesystem access. Tool toggles and sandbox restrictions apply only to API voices.
          </p>
        </div>
      )}
    </>
  );
}
