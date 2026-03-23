import React, { useEffect, useRef, useState } from 'react';
import { Search, ArrowRight, MessagesSquare } from 'lucide-react';
import { useSearchStore } from '../../store/searchStore';
import { useSessionStore } from '../../store/sessionStore';
import { useUIStore } from '../../store/uiStore';
import { SearchSnippet } from './SearchSnippet';
import type { SearchResult } from '../../../shared/types';

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isThisYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(isThisYear ? {} : { year: 'numeric' }),
  });
}

interface ResultCardProps {
  result: SearchResult;
  index: number;
  onClick: () => void;
}

function ResultCard({ result, onClick, index }: ResultCardProps) {
  const isConductor = result.role === 'conductor';
  const roleLabel = isConductor ? 'you' : (result.voiceName ?? 'voice');

  return (
    <button
      onClick={onClick}
      className="search-result-card group w-full text-left"
      style={{ animationDelay: `${Math.min(index * 40, 300)}ms` }}
    >
      {/* Left accent bar */}
      <div
        className="search-result-accent"
        aria-hidden
        style={{
          background: isConductor
            ? 'var(--color-brand)'
            : 'oklch(62% 0.004 90)',
        }}
      />

      <div className="search-result-body">
        {/* Header row */}
        <div className="search-result-header">
          <span className="search-result-session">{result.sessionName}</span>
          <div className="search-result-meta">
            <span
              className="search-result-role"
              style={{
                color: isConductor ? 'var(--color-brand)' : 'var(--color-text-muted)',
                background: isConductor
                  ? 'oklch(95% 0.04 264)'
                  : 'var(--color-surface-overlay)',
              }}
            >
              {roleLabel}
            </span>
            <span className="search-result-date">{formatTimestamp(result.timestamp)}</span>
          </div>
        </div>

        {/* Snippet */}
        <p className="search-result-snippet">
          <SearchSnippet snippet={result.snippet} />
        </p>

        {/* Hover CTA */}
        <div className="search-result-cta">
          <span>Jump to message</span>
          <ArrowRight size={12} strokeWidth={2} />
        </div>
      </div>
    </button>
  );
}

function LoadingDots() {
  return (
    <div className="search-loading">
      {[0, 1, 2].map((i) => (
        <span key={i} className="search-loading-dot" style={{ animationDelay: `${i * 160}ms` }} />
      ))}
    </div>
  );
}

export default function SearchView() {
  const {
    globalQuery,
    globalResults,
    globalLoading,
    setGlobalQuery,
    setGlobalResults,
    setGlobalLoading,
    setPendingNavigation,
  } = useSearchStore();

  const { sessions, setSessions, openSession } = useSessionStore();
  const { setView } = useUIStore();

  const inputRef = useRef<HTMLInputElement>(null);
  const [localQuery, setLocalQuery] = useState(globalQuery);
  const [isFocused, setIsFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = localQuery.trim();
    if (trimmed.length < 2) {
      setGlobalQuery(localQuery);
      setGlobalResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setGlobalQuery(localQuery);
      setGlobalLoading(true);
      try {
        const results = await window.polyphon.search.messages(trimmed);
        setGlobalResults(results);
      } finally {
        setGlobalLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [localQuery]);

  async function handleResultClick(result: SearchResult) {
    let session = sessions.find((s) => s.id === result.sessionId);
    if (!session) {
      session = (await window.polyphon.session.get(result.sessionId)) ?? undefined;
      if (session) setSessions([session, ...sessions]);
    }
    if (!session) return;
    setPendingNavigation({ sessionId: result.sessionId, messageId: result.messageId, query: globalQuery.trim() });
    openSession(result.sessionId);
    setView('session');
  }

  const trimmedQuery = localQuery.trim();
  const hasQuery = trimmedQuery.length >= 2;
  const showEmpty = !hasQuery && !globalLoading;
  const showNoResults = hasQuery && !globalLoading && globalResults.length === 0;
  const showResults = !globalLoading && globalResults.length > 0;

  const resultCount = globalResults.length === 50
    ? '50+ results'
    : `${globalResults.length} result${globalResults.length === 1 ? '' : 's'}`;

  return (
    <div className="search-view">
      {/* Header */}
      <div className="search-header">
        <h1 className="search-title">Search</h1>

        {/* Input */}
        <div className={`search-input-wrap${isFocused ? ' search-input-wrap--focused' : ''}`}>
          <Search
            size={16}
            strokeWidth={1.75}
            className="search-input-icon"
            aria-hidden
          />
          <input
            ref={inputRef}
            type="text"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Search across all sessions…"
            className="search-input"
            spellCheck={false}
            aria-label="Search messages"
          />
          {localQuery.length > 0 && (
            <button
              onClick={() => setLocalQuery('')}
              className="search-clear"
              aria-label="Clear search"
              tabIndex={-1}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="search-body">

        {/* Empty state */}
        {showEmpty && (
          <div className="search-empty">
            <div className="search-empty-icon">
              <MessagesSquare size={28} strokeWidth={1.25} />
            </div>
            <p className="search-empty-title">Search your conversations</p>
            <p className="search-empty-hint">Messages across all sessions — type at least 2 characters</p>
          </div>
        )}

        {/* Loading */}
        {globalLoading && <LoadingDots />}

        {/* No results */}
        {showNoResults && (
          <div className="search-empty">
            <div className="search-empty-icon search-empty-icon--dim">
              <Search size={24} strokeWidth={1.25} />
            </div>
            <p className="search-empty-title">No results for "{trimmedQuery}"</p>
            <p className="search-empty-hint">Try a different term or check another session</p>
          </div>
        )}

        {/* Results */}
        {showResults && (
          <div className="search-results">
            <div className="search-results-meta">
              <span className="search-results-count">{resultCount}</span>
              <span className="search-results-query">for "{trimmedQuery}"</span>
            </div>
            <div className="search-results-list">
              {globalResults.map((result, i) => (
                <ResultCard
                  key={result.messageId}
                  result={result}
                  index={i}
                  onClick={() => handleResultClick(result)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
