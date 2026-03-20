import React, { useState } from 'react';
import { Music2, Radio, Check, X, Ban, MessageCircleQuestion, RefreshCw, TriangleAlert } from 'lucide-react';
import type { Composition, CompositionVoice } from '../../../shared/types';
import VoiceSelector from './VoiceSelector';
import VoiceOrderList from './VoiceOrderList';
import { HelpTooltip } from '../Shared/HelpTooltip';

export interface CompositionBuilderProps {
  initial?: Partial<Composition>;
  onSave: (
    composition: Omit<Composition, 'id' | 'createdAt' | 'updatedAt' | 'archived'>,
  ) => void;
  onCancel?: () => void;
}

export default function CompositionBuilder({
  initial,
  onSave,
  onCancel,
}: CompositionBuilderProps): React.JSX.Element {
  const [name, setName] = useState(initial?.name ?? '');
  const [mode, setMode] = useState<'conductor' | 'broadcast'>(
    initial?.mode ?? 'broadcast',
  );
  const [voices, setVoices] = useState<CompositionVoice[]>(
    (initial?.voices ?? []).map((v, i) => ({
      ...v,
      compositionId: '',
      order: i,
    })),
  );
  const [continuationPolicy, setContinuationPolicy] = useState<
    'none' | 'prompt' | 'auto'
  >(initial?.continuationPolicy ?? 'prompt');
  const [continuationMaxRounds, setContinuationMaxRounds] = useState(
    initial?.continuationMaxRounds ?? 2,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addVoice(
    voice: Omit<CompositionVoice, 'id' | 'compositionId' | 'order'>,
  ) {
    const newVoice: CompositionVoice = {
      ...voice,
      id: `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      compositionId: '',
      order: voices.length,
    };
    setVoices((prev) => [...prev, newVoice]);
  }

  function updateVoice(updated: CompositionVoice) {
    setVoices((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
  }

  function handleSave() {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (voices.length === 0) {
      setError('Add at least one voice.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      onSave({
        name: name.trim(),
        mode,
        voices,
        continuationPolicy,
        continuationMaxRounds,
      });
    } finally {
      setSaving(false);
    }
  }

  const modeOptions = [
    {
      value: 'broadcast' as const,
      title: 'Broadcast',
      description: 'Your message is sent to all voices simultaneously.',
      icon: <Radio size={18} strokeWidth={1.75} />,
    },
    {
      value: 'conductor' as const,
      title: 'Conductor-Directed',
      description:
        'You direct each voice individually with targeted messages.',
      icon: <Music2 size={18} strokeWidth={1.75} />,
    },
  ];

  const policyOptions = [
    {
      value: 'none' as const,
      title: 'None',
      description: 'Stop after one round. Voices respond once and wait.',
      icon: <Ban size={18} strokeWidth={1.75} />,
    },
    {
      value: 'prompt' as const,
      title: 'Prompt me',
      description: 'Ask before starting each new round of responses.',
      icon: <MessageCircleQuestion size={18} strokeWidth={1.75} />,
    },
    {
      value: 'auto' as const,
      title: 'Auto',
      description: 'Voices continue responding automatically for up to the configured number of rounds.',
      icon: <RefreshCw size={18} strokeWidth={1.75} />,
    },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {initial?.name ? 'Edit Composition' : 'New Composition'}
        </h2>

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Composition"
            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Mode */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Mode
            <HelpTooltip text="Controls how your messages are sent to voices. Directed lets you target individual voices; Broadcast sends your message to all at once." />
          </label>
          <div className="grid grid-cols-2 gap-3">
            {modeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setMode(opt.value)}
                aria-pressed={mode === opt.value}
                className={`flex flex-col items-start gap-2 p-4 rounded-xl border-2 transition-all text-left ${
                  mode === opt.value
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <span
                  className={`${
                    mode === opt.value
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-gray-400 dark:text-gray-500'
                  }`}
                >
                  {opt.icon}
                </span>
                <div>
                  <div
                    className={`text-sm font-semibold ${
                      mode === opt.value
                        ? 'text-indigo-700 dark:text-indigo-300'
                        : 'text-gray-900 dark:text-gray-100'
                    }`}
                  >
                    {opt.title}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                    {opt.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Continuation policy (broadcast only) */}
        {mode === 'broadcast' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Continuation Policy
              <HelpTooltip text="After all voices respond, whether to prompt you before starting another round (Prompt me), do it automatically (Auto), or stop after one round (None)." />
            </label>
            <div className="grid grid-cols-3 gap-3">
              {policyOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setContinuationPolicy(opt.value)}
                  aria-pressed={continuationPolicy === opt.value}
                  aria-label={opt.title}
                  className={`flex flex-col items-start gap-2 p-4 rounded-xl border-2 transition-all text-left ${
                    continuationPolicy === opt.value
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <span
                    className={`${
                      continuationPolicy === opt.value
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    {opt.icon}
                  </span>
                  <div>
                    <div
                      className={`text-sm font-semibold ${
                        continuationPolicy === opt.value
                          ? 'text-indigo-700 dark:text-indigo-300'
                          : 'text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      {opt.title}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                      {opt.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {continuationPolicy === 'auto' && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-gray-500 dark:text-gray-400">
                    Max rounds
                  </label>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
                    {continuationMaxRounds}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={continuationMaxRounds}
                  onChange={(e) =>
                    setContinuationMaxRounds(Number(e.target.value))
                  }
                  className="w-full accent-indigo-600"
                />
                {continuationMaxRounds > 3 && (
                  <p className="flex items-center gap-1.5 mt-2 text-xs text-amber-600 dark:text-amber-400">
                    <TriangleAlert size={12} strokeWidth={1.75} />
                    High round counts can use a lot of tokens quickly.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Voice roster */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Available Voices — click to add to Ensemble
            <HelpTooltip text="Click a voice to add it to the ensemble. Each voice can have its own model, system prompt, and tone." />
          </label>
          <VoiceSelector onSelect={addVoice} voices={voices} />
          {voices.length > 0 ? (
            <div className="mt-4">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Ensemble — drag to reorder
              </div>
              <VoiceOrderList
                voices={voices}
                onReorder={setVoices}
                onRemove={(id) =>
                  setVoices((prev) =>
                    prev
                      .filter((v) => v.id !== id)
                      .map((v, i) => ({ ...v, order: i })),
                  )
                }
                onUpdate={updateVoice}
              />
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-400 dark:text-gray-600">
              Add voices to assemble your ensemble.
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Save / Cancel */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors"
          >
            <Check size={16} strokeWidth={1.75} />
            {saving ? 'Saving…' : 'Save Composition'}
          </button>
          {onCancel && (
            <button
              onClick={onCancel}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <X size={16} strokeWidth={1.75} />
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
