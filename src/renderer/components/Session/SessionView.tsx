import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, PanelRightClose, PanelRightOpen, Square, X, Pencil, Check, FolderOpen } from 'lucide-react';
import type { Session, Message, VoiceDescriptor } from '../../../shared/types';
import { PROVIDER_METADATA } from '../../../shared/constants';
import { useSessionStore } from '../../store/sessionStore';
import MessageFeed from './MessageFeed';
import VoicePanel from './VoicePanel';
import ConductorPanel from './ConductorPanel';
import ConductorInput from './ConductorInput';

interface SessionViewProps {
  session: Session;
  onBack: () => void;
}

export default function SessionView({
  session,
  onBack,
}: SessionViewProps): React.JSX.Element {
  const { renameSession } = useSessionStore();
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  function startRename() {
    setRenameValue(session.name);
    setIsRenaming(true);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }

  async function commitRename() {
    const trimmed = renameValue.trim();
    setIsRenaming(false);
    if (trimmed && trimmed !== session.name) {
      await window.polyphon.session.rename(session.id, trimmed).catch(() => {});
      renameSession(session.id, trimmed);
    }
  }

  const {
    streamingContent,
    streamingVoices,
    pendingVoices,
    appendToken,
    markStreamDone,
    markVoicePending,
    messages,
    setMessages,
    appendMessage,
  } = useSessionStore();

  const [ensemble, setEnsemble] = useState<VoiceDescriptor[]>([]);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [voiceErrors, setVoiceErrors] = useState<Record<string, string>>({});
  const [noTargetHint, setNoTargetHint] = useState<string[] | null>(null);
  const [continuationNudge, setContinuationNudge] = useState<{
    roundIndex: number;
    voiceResponses: Message[];
  } | null>(null);

  // Ref so streaming callbacks always see the latest ensemble without re-subscribing
  const ensembleRef = useRef<VoiceDescriptor[]>([]);
  useEffect(() => {
    ensembleRef.current = ensemble;
  }, [ensemble]);

  const sessionMessages = messages[session.id] ?? [];
  const sessionStreamingContent = streamingContent[session.id] ?? {};
  const sessionStreamingVoices = streamingVoices[session.id] ?? new Set<string>();
  const sessionPendingVoices = pendingVoices[session.id] ?? new Set<string>();
  const isAnyStreaming = sessionStreamingVoices.size > 0;
  const isAnyPending = sessionPendingVoices.size > 0;

  // Load composition → derive ensemble
  useEffect(() => {
    window.polyphon.composition.get(session.compositionId).then((comp) => {
      if (!comp) return;
      const voices: VoiceDescriptor[] = comp.voices.map((v, i) => ({
        id: v.id,
        name: v.displayName,
        type: v.cliCommand || PROVIDER_METADATA[v.provider]?.defaultVoiceType === 'cli' ? 'cli' : 'api',
        provider: v.provider,
        color: v.color,
        avatarIcon: v.avatarIcon,
        side: i % 2 === 0 ? 'left' : 'right',
      }));
      setEnsemble(voices);
    });
  }, [session.compositionId]);

  // Load historical messages
  useEffect(() => {
    window.polyphon.session
      .listMessages(session.id)
      .then((msgs) => setMessages(session.id, msgs ?? []))
      .catch(() => setMessages(session.id, []));
  }, [session.id]);

  // Register IPC streaming listeners — only re-subscribe when session changes
  useEffect(() => {
    const unsubPending = window.polyphon.voice.onPending(session.id, (voiceId) => {
      markVoicePending(session.id, voiceId);
    });

    const unsubToken = window.polyphon.voice.onToken(
      session.id,
      (voiceId, token) => {
        appendToken(session.id, voiceId, token);
      },
    );

    const unsubDone = window.polyphon.voice.onDone(session.id, (voiceId, roundIndex) => {
      const state = useSessionStore.getState();
      const content = state.streamingContent[session.id]?.[voiceId] ?? '';
      const voice = ensembleRef.current.find((v) => v.id === voiceId);

      const newMsg: Message = {
        id: `msg-${Date.now()}-${voiceId}`,
        sessionId: session.id,
        role: 'voice',
        voiceId,
        voiceName: voice?.name ?? null,
        content,
        timestamp: Date.now(),
        roundIndex,
      };

      appendMessage(session.id, newMsg);
      markStreamDone(session.id, voiceId);
    });

    const unsubError = window.polyphon.voice.onError(
      session.id,
      (voiceId, error) => {
        setVoiceErrors((prev) => ({ ...prev, [voiceId]: error }));
        markStreamDone(session.id, voiceId);
      },
    );

    const unsubContinuation = window.polyphon.session.onContinuationPrompt(
      session.id,
      (payload) => {
        setContinuationNudge(payload);
      },
    );

    const unsubNoTarget = window.polyphon.session.onNoTarget(
      session.id,
      (payload) => {
        setNoTargetHint(payload.voiceNames);
      },
    );

    return () => {
      unsubPending();
      unsubToken();
      unsubDone();
      unsubError();
      unsubContinuation();
      unsubNoTarget();
    };
  }, [session.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit(content: string) {
    const state = useSessionStore.getState();
    const currentMsgs = state.messages[session.id] ?? [];
    const maxRound =
      currentMsgs.length > 0
        ? Math.max(...currentMsgs.map((m) => m.roundIndex))
        : -1;

    const conductorMsg: Message = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: 'conductor',
      voiceId: null,
      voiceName: null,
      content,
      timestamp: Date.now(),
      roundIndex: maxRound + 1,
    };

    setNoTargetHint(null);
    appendMessage(session.id, conductorMsg);
    window.polyphon.voice.send(session.id, conductorMsg).catch((err: unknown) => {
      const error = err instanceof Error ? err.message : String(err);
      setVoiceErrors((prev) => ({ ...prev, _ipc: error }));
    });
  }

  function handleContinue() {
    if (!continuationNudge) return;
    const continueMsg: Message = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: 'conductor',
      voiceId: null,
      voiceName: null,
      content: '',
      timestamp: Date.now(),
      roundIndex: continuationNudge.roundIndex,
    };
    appendMessage(session.id, continueMsg);
    window.polyphon.voice.send(session.id, continueMsg).catch((err: unknown) => {
      const error = err instanceof Error ? err.message : String(err);
      setVoiceErrors((prev) => ({ ...prev, _ipc: error }));
    });
    setContinuationNudge(null);
  }

  const voiceMap = Object.fromEntries(ensemble.map((v) => [v.id, v]));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Back to sessions"
        >
          <ArrowLeft size={16} strokeWidth={1.75} />
        </button>

        <div className="group flex-1 min-w-0 flex items-center gap-2">
          {isRenaming ? (
            <>
              <input
                ref={renameInputRef}
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); void commitRename(); }
                  if (e.key === 'Escape') { e.preventDefault(); setIsRenaming(false); }
                }}
                className="flex-1 min-w-0 text-sm font-semibold bg-white dark:bg-gray-800 border border-indigo-400 rounded px-1.5 py-0.5 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={() => void commitRename()}
                className="p-1 rounded text-green-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
                aria-label="Confirm rename"
              >
                <Check size={14} strokeWidth={1.75} />
              </button>
              <button
                onClick={() => setIsRenaming(false)}
                className="p-1 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
                aria-label="Cancel rename"
              >
                <X size={14} strokeWidth={1.75} />
              </button>
            </>
          ) : (
            <>
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 truncate text-sm">
                {session.name}
              </h2>
              <button
                onClick={startRename}
                className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                aria-label="Rename session"
              >
                <Pencil size={14} strokeWidth={1.75} />
              </button>
            </>
          )}
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
              session.mode === 'conductor'
                ? 'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400'
                : 'bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-400'
            }`}
          >
            {session.mode === 'conductor' ? 'Directed' : 'Broadcast'}
          </span>
        </div>

        {session.workingDir && (
          <span
            title={session.workingDir}
            className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 font-mono min-w-0 shrink truncate"
          >
            <FolderOpen size={12} strokeWidth={1.75} className="shrink-0" />
            {session.workingDir}
          </span>
        )}

        {(isAnyStreaming || isAnyPending) && (
          <button
            onClick={() => window.polyphon.voice.abort(session.id)}
            aria-label="Stop generating"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors font-medium shrink-0"
          >
            <Square size={16} strokeWidth={1.75} />
            Stop
          </button>
        )}
      </header>

      {/* Banners */}
      <div aria-live="polite">
        {/* Voice error banners */}
        {Object.entries(voiceErrors).map(([voiceId, error]) => (
          <div
            key={voiceId}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 text-sm shrink-0"
          >
            <span className="font-medium">
              {voiceId === '_ipc' ? 'Error' : (voiceMap[voiceId]?.name ?? voiceId)}:
            </span>
            <span className="flex-1 min-w-0 truncate">{error}</span>
            <button
              onClick={() =>
                setVoiceErrors((prev) => {
                  const next = { ...prev };
                  delete next[voiceId];
                  return next;
                })
              }
              className="text-red-400 hover:text-red-600 dark:hover:text-red-300 shrink-0"
              aria-label="Dismiss error"
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </div>
        ))}

        {/* Directed mode: no @mention detected */}
        {noTargetHint && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-900 text-sm shrink-0">
            <span className="text-blue-700 dark:text-blue-400 flex-1 text-xs">
              Directed mode — use{' '}
              {noTargetHint.map((name, i) => (
                <span key={name}>
                  <span className="font-mono font-medium">@{name}</span>
                  {i < noTargetHint.length - 1 ? ', ' : ''}
                </span>
              ))}{' '}
              to address a voice.
            </span>
            <button
              onClick={() => setNoTargetHint(null)}
              className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 shrink-0"
              aria-label="Dismiss"
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </div>
        )}

        {/* Continuation nudge */}
        {continuationNudge && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900 text-sm shrink-0">
            <span className="text-amber-700 dark:text-amber-400 flex-1 text-xs">
              Agents have more to say — let them continue?
            </span>
            <button
              onClick={handleContinue}
              className="text-xs px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/50 font-medium transition-colors"
            >
              Allow
            </button>
            <button
              onClick={() => setContinuationNudge(null)}
              className="text-xs px-2.5 py-1 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-medium transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Main area: feed + voice strip */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <MessageFeed
            messages={sessionMessages}
            streamingVoices={sessionStreamingVoices}
            streamingContent={sessionStreamingContent}
            pendingVoices={sessionPendingVoices}
            ensemble={ensemble}
          />
        </div>

        <div className="shrink-0 border-l border-gray-200 dark:border-gray-800 overflow-y-auto overflow-x-hidden flex flex-col">
          <button
            onClick={() => setSidebarExpanded((v) => !v)}
            aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            className={`flex items-center py-2 px-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${sidebarExpanded ? 'justify-start' : 'justify-center'}`}
          >
            {sidebarExpanded
              ? <PanelRightClose size={16} strokeWidth={1.75} />
              : <PanelRightOpen size={16} strokeWidth={1.75} />}
          </button>
          <ConductorPanel expanded={sidebarExpanded} />
          {ensemble.map((voice) => (
            <VoicePanel
              key={voice.id}
              voice={voice}
              isStreaming={sessionStreamingVoices.has(voice.id)}
              isPending={sessionPendingVoices.has(voice.id)}
              expanded={sidebarExpanded}
            />
          ))}
        </div>
      </div>

      <ConductorInput
        ensemble={ensemble}
        onSubmit={handleSubmit}
        disabled={isAnyStreaming || isAnyPending}
        mode={session.mode}
      />
    </div>
  );
}
