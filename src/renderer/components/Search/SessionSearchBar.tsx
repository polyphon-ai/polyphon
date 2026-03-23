import React, { useEffect, useRef, useState } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import { useSearchStore } from '../../store/searchStore';

interface SessionSearchBarProps {
  sessionId: string;
  onClose: () => void;
}

export function SessionSearchBar({ sessionId, onClose }: SessionSearchBarProps) {
  const {
    sessionQuery,
    sessionResultIds,
    sessionMatchIndex,
    setSessionQuery,
    setSessionResultIds,
    nextSessionMatch,
    prevSessionMatch,
  } = useSearchStore();

  const [localQuery, setLocalQuery] = useState(sessionQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = localQuery.trim();
    if (trimmed.length < 2) {
      setSessionQuery(localQuery);
      setSessionResultIds([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSessionQuery(localQuery);
      const results = await window.polyphon.search.messages(trimmed, sessionId);
      setSessionResultIds(results.map((r) => r.messageId));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [localQuery, sessionId]);

  const matchCount = sessionResultIds.length;
  const currentMatch = matchCount > 0 ? sessionMatchIndex + 1 : 0;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        prevSessionMatch();
      } else {
        nextSessionMatch();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      nextSessionMatch();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      prevSessionMatch();
    }
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shrink-0">
      <Search size={14} strokeWidth={1.75} className="text-gray-400 dark:text-gray-500 shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={localQuery}
        onChange={(e) => setLocalQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search session…"
        className="flex-1 text-sm bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none"
      />
      {localQuery.trim().length >= 2 && (
        <span className="text-xs text-gray-400 dark:text-gray-600 shrink-0 tabular-nums">
          {matchCount === 0 ? 'No results' : `${currentMatch} of ${matchCount} message${matchCount === 1 ? '' : 's'}`}
        </span>
      )}
      <button
        onClick={prevSessionMatch}
        disabled={matchCount === 0}
        aria-label="Previous match"
        className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 transition-colors"
      >
        <ChevronUp size={14} strokeWidth={1.75} />
      </button>
      <button
        onClick={nextSessionMatch}
        disabled={matchCount === 0}
        aria-label="Next match"
        className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 transition-colors"
      >
        <ChevronDown size={14} strokeWidth={1.75} />
      </button>
      <button
        onClick={onClose}
        aria-label="Close search"
        className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
      >
        <X size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}
