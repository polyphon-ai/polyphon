import React, { useEffect, useState } from 'react';
import { GripVertical, X, Trash2, ChevronDown, ChevronUp, Check } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CompositionVoice } from '../../../shared/types';
import { PROVIDER_METADATA, type VoiceType } from '../../../shared/constants';
import { useSettingsStore } from '../../store/settingsStore';
import { HelpTooltip } from '../Shared/HelpTooltip';
import { VoiceConfigFields } from './VoiceConfigFields';

export interface VoiceOrderListProps {
  voices: CompositionVoice[];
  onReorder: (voices: CompositionVoice[]) => void;
  onRemove: (voiceId: string) => void;
  onUpdate: (voice: CompositionVoice) => void;
}

function SortableVoiceRow({
  voice,
  index,
  isExpanded,
  onToggle,
  onRemove,
  onSave,
  excludedColors,
  existingNames,
}: {
  voice: CompositionVoice;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onSave: (updated: CompositionVoice) => void;
  excludedColors: Set<string>;
  existingNames: Set<string>;
}) {
  const { tones, systemPromptTemplates, modelFetchStates, customProviderModelFetchStates, providerConfigs } = useSettingsStore();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: voice.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const [confirmRemove, setConfirmRemove] = useState(false);
  const [nameError, setNameError] = useState('');
  const [displayName, setDisplayName] = useState(voice.displayName);
  const [color, setColor] = useState(voice.color);
  const [model, setModel] = useState(voice.model ?? '');
  const [systemPrompt, setSystemPrompt] = useState(voice.systemPrompt ?? '');
  const [toneOverride, setToneOverride] = useState(voice.toneOverride ?? '');
  const [systemPromptTemplateId, setSystemPromptTemplateId] = useState<string | undefined>(
    voice.systemPromptTemplateId,
  );
  const [voiceType, setVoiceType] = useState<VoiceType>(voice.cliCommand ? 'cli' : 'api');
  const [enabledTools, setEnabledTools] = useState<string[]>(voice.enabledTools ?? []);

  // Re-sync form fields when the row is opened for editing
  useEffect(() => {
    if (isExpanded) {
      setDisplayName(voice.displayName);
      setColor(voice.color);
      setModel(voice.model ?? '');
      setSystemPrompt(voice.systemPrompt ?? '');
      setToneOverride(voice.toneOverride ?? '');
      setSystemPromptTemplateId(voice.systemPromptTemplateId);
      setVoiceType(voice.cliCommand ? 'cli' : 'api');
      setEnabledTools(voice.enabledTools ?? []);
    }
  }, [isExpanded]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCli = Boolean(voice.cliCommand);

  // Types enabled in settings for this provider (custom providers are always API-only)
  const enabledTypes: VoiceType[] = voice.customProviderId
    ? ['api']
    : (PROVIDER_METADATA[voice.provider]?.supportedTypes.filter(
        (t) => providerConfigs[voice.provider]?.[t]?.enabled,
      ) as VoiceType[] ?? []);
  const supportedTypes: ReadonlyArray<VoiceType> = voice.customProviderId
    ? ['api']
    : (PROVIDER_METADATA[voice.provider]?.supportedTypes as VoiceType[] ?? []);
  const canToggleType = enabledTypes.length > 1;
  const lockedBecauseSettings = !canToggleType && supportedTypes.length > 1;

  const availableModels: readonly string[] = (() => {
    if (voiceType === 'cli') return [];
    if (voice.customProviderId) {
      const fetched = customProviderModelFetchStates[voice.customProviderId]?.models;
      return fetched?.length ? fetched : [];
    }
    const fetched = modelFetchStates[voice.provider]?.models;
    if (fetched?.length) return fetched;
    return PROVIDER_METADATA[voice.provider]?.defaultModels ?? [];
  })();

  function handleSave() {
    const resolvedName = displayName.trim() || voice.displayName;
    if (existingNames.has(resolvedName.toLowerCase())) {
      setNameError(`A voice named "${resolvedName}" already exists in this composition.`);
      return;
    }
    const switchingToCli = voiceType === 'cli';
    onSave({
      ...voice,
      displayName: displayName.trim() || voice.displayName,
      color,
      ...(switchingToCli
        ? {
            cliCommand:
              voice.cliCommand ??
              providerConfigs[voice.provider]?.cli?.cliCommand ??
              PROVIDER_METADATA[voice.provider]?.defaultCliCommand ??
              undefined,
            model: undefined,
          }
        : {
            model: model || undefined,
            cliCommand: undefined,
          }),
      systemPrompt: systemPrompt.trim() || undefined,
      toneOverride: toneOverride || undefined,
      systemPromptTemplateId,
      enabledTools: switchingToCli ? [] : enabledTools,
    });
    onToggle();
  }

  return (
    <div ref={setNodeRef} style={style} className="mb-2">
      {/* Row header */}
      <div
        className={`flex items-center gap-2.5 px-3 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 select-none${isExpanded ? ' rounded-t-lg' : ' rounded-lg'}`}
      >
        <span className="text-xs text-gray-400 dark:text-gray-600 w-5 text-center font-mono tabular-nums shrink-0">
          {index + 1}
        </span>

        <button
          className="cursor-grab active:cursor-grabbing hover:text-gray-500 dark:hover:text-gray-400 transition-colors touch-none shrink-0 text-gray-300 dark:text-gray-600"
          {...attributes}
          {...listeners}
          aria-label={`Drag to reorder ${voice.displayName}`}
        >
          <GripVertical size={14} strokeWidth={1.75} />
        </button>

        {/* Clickable expand area */}
        <button
          className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? `Collapse ${voice.displayName}` : `Edit ${voice.displayName}`}
        >
          <div
            className="w-3.5 h-3.5 rounded-full shrink-0 transition-colors"
            style={{ backgroundColor: isExpanded ? color : voice.color }}
          />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate flex-1">
            {voice.displayName}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-600 shrink-0">
            {voice.provider}
          </span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
            isCli
              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
              : 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400'
          }`}>
            {isCli ? 'CLI' : 'API'}
          </span>
          {isExpanded
            ? <ChevronUp size={14} strokeWidth={1.75} className="text-gray-400 shrink-0" />
            : <ChevronDown size={14} strokeWidth={1.75} className="text-gray-400 dark:text-gray-600 shrink-0" />}
        </button>

        {confirmRemove ? (
          <div className="flex items-center gap-1.5 shrink-0 ml-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">Remove?</span>
            <button
              onClick={onRemove}
              className="text-xs px-2 py-0.5 rounded bg-red-600 hover:bg-red-700 text-white transition-colors"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmRemove(false)}
              className="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmRemove(true)}
            className="text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors shrink-0 ml-1"
            aria-label={`Remove ${voice.displayName}`}
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        )}
      </div>

      {/* Inline edit form */}
      {isExpanded && (
        <div className="border border-t-0 border-gray-200 dark:border-gray-700 rounded-b-lg bg-gray-50 dark:bg-gray-800/50 p-4 space-y-3">
          <VoiceConfigFields
            displayName={displayName}
            color={color}
            voiceType={voiceType}
            model={model}
            systemPrompt={systemPrompt}
            toneOverride={toneOverride}
            systemPromptTemplateId={systemPromptTemplateId}
            enabledTools={enabledTools}
            setDisplayName={setDisplayName}
            setColor={setColor}
            setVoiceType={setVoiceType}
            setModel={setModel}
            setSystemPrompt={setSystemPrompt}
            setToneOverride={setToneOverride}
            setSystemPromptTemplateId={setSystemPromptTemplateId}
            setEnabledTools={setEnabledTools}
            nameError={nameError}
            setNameError={setNameError}
            isCli={isCli}
            enabledTypes={enabledTypes}
            canToggleType={canToggleType}
            lockedBecauseSettings={lockedBecauseSettings}
            hideVoiceTypeToggle={!!voice.customProviderId}
            availableModels={availableModels}
            tones={tones}
            systemPromptTemplates={systemPromptTemplates}
            excludedColors={excludedColors}
            showHelpTooltips
            showTools
            systemPromptRows={3}
          />

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Check size={14} strokeWidth={1.75} />
              Save
            </button>
            <button
              onClick={onToggle}
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

export default function VoiceOrderList({
  voices,
  onReorder,
  onRemove,
  onUpdate,
}: VoiceOrderListProps): React.JSX.Element {
  const { userProfile } = useSettingsStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = voices.findIndex((v) => v.id === active.id);
      const newIndex = voices.findIndex((v) => v.id === over.id);
      onReorder(
        arrayMove(voices, oldIndex, newIndex).map((v, i) => ({ ...v, order: i })),
      );
    }
  }

  if (voices.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-600">
        No voices added yet
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={() => setExpandedId(null)}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={voices.map((v) => v.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul aria-label="Voice order list">
          {voices.map((voice, index) => {
            const otherVoices = voices.filter((v) => v.id !== voice.id);
            // Exclude all other voices' colors + conductor color (but not this voice's own color)
            const excludedColors = new Set<string>([
              ...(userProfile.conductorColor ? [userProfile.conductorColor] : []),
              ...otherVoices.map((v) => v.color),
            ]);
            const existingNames = new Set(otherVoices.map((v) => v.displayName.toLowerCase()));
            return (
              <li key={voice.id}>
                <SortableVoiceRow
                  voice={voice}
                  index={index}
                  isExpanded={expandedId === voice.id}
                  onToggle={() => setExpandedId((id) => (id === voice.id ? null : voice.id))}
                  onRemove={() => onRemove(voice.id)}
                  onSave={onUpdate}
                  excludedColors={excludedColors}
                  existingNames={existingNames}
                />
              </li>
            );
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
