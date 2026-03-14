import React, { useRef, useState, useEffect } from 'react';
import { SendHorizontal } from 'lucide-react';
import type { VoiceDescriptor } from '../../../shared/types';

export interface ConductorInputProps {
  ensemble: VoiceDescriptor[];
  onSubmit: (content: string) => void;
  disabled?: boolean;
  mode: 'conductor' | 'broadcast';
}

export default function ConductorInput({
  ensemble,
  onSubmit,
  disabled = false,
  mode,
}: ConductorInputProps): React.JSX.Element {
  const [text, setText] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const showMention = mentionQuery !== null && mentionQuery.length >= 1;

  const filteredVoices =
    mentionQuery !== null && mentionQuery.length >= 1
      ? ensemble
          .filter((v) =>
            v.name.toLowerCase().includes(mentionQuery.toLowerCase()),
          )
          .sort((a, b) => {
            const q = mentionQuery.toLowerCase();
            const aStarts = a.name.toLowerCase().startsWith(q);
            const bStarts = b.name.toLowerCase().startsWith(q);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return 0;
          })
      : [];

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Reset mention index when filtered list changes
  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery]);

  // Restore focus when the input becomes enabled again (voices finished streaming)
  useEffect(() => {
    if (!disabled) {
      textareaRef.current?.focus();
    }
  }, [disabled]);

  function resizeTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setText(val);
    resizeTextarea();

    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const match = before.match(/@(\w+)$/);
    if (match) {
      setMentionQuery(match[1] ?? null);
      setMentionStart(cursor - match[0].length);
    } else {
      setMentionQuery(null);
    }
  }

  function insertMention(voice: VoiceDescriptor) {
    const cursor = textareaRef.current?.selectionStart ?? mentionStart;
    const before = text.slice(0, mentionStart);
    const after = text.slice(cursor);
    const inserted = `@${voice.name} `;
    const next = before + inserted + after;
    setText(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const pos = mentionStart + inserted.length;
        textareaRef.current.setSelectionRange(pos, pos);
        textareaRef.current.focus();
        resizeTextarea();
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showMention && filteredVoices.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % filteredVoices.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(
          (i) => (i - 1 + filteredVoices.length) % filteredVoices.length,
        );
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredVoices[mentionIndex]!);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setText('');
    setMentionQuery(null);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.focus();
      }
    });
  }

  return (
    <div className="relative border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 shrink-0">
      {/* @mention dropdown */}
      {showMention && filteredVoices.length > 0 && (
        <div
          role="listbox"
          aria-label="Mention a voice"
          className="absolute bottom-full left-4 right-4 mb-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden z-20"
        >
          {filteredVoices.map((voice, i) => (
            <button
              key={voice.id}
              role="option"
              aria-selected={i === mentionIndex}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent textarea blur
                insertMention(voice);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                i === mentionIndex
                  ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                style={{
                  backgroundColor: `${voice.color}25`,
                  color: voice.color,
                }}
              >
                {voice.name.charAt(0).toUpperCase()}
              </span>
              <span className="font-medium">@{voice.name}</span>
              <span className="text-xs text-gray-400 dark:text-gray-600 ml-auto">
                {voice.provider}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-1.5 focus-within:border-indigo-400 dark:focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-label="Message"
          placeholder={
            disabled ? 'Waiting for voices…' : 'Message the ensemble…'
          }
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none disabled:opacity-50 overflow-hidden"
          style={{ minHeight: '24px', maxHeight: '120px' }}
        />
        <div className="flex items-center gap-2 shrink-0">
          {text.length > 500 && (
            <span
              className={`text-xs tabular-nums ${
                text.length > 2000
                  ? 'text-red-400'
                  : 'text-gray-400 dark:text-gray-500'
              }`}
            >
              {text.length}
            </span>
          )}
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={submit}
            disabled={disabled || !text.trim()}
            aria-label="Send message"
            className="w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors shrink-0"
          >
            <SendHorizontal size={15} strokeWidth={1.75} />
          </button>
        </div>
      </div>

    </div>
  );
}
