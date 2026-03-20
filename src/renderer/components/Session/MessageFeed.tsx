import React, { useEffect, useRef } from 'react';
import { Music } from 'lucide-react';
import type { Message, VoiceDescriptor } from '../../../shared/types';
import MessageBubble from './MessageBubble';

export interface MessageFeedProps {
  messages: Message[];
  streamingVoices: Set<string>;
  streamingContent: Record<string, string>;
  pendingVoices: Set<string>;
  ensemble: VoiceDescriptor[];
}

export default function MessageFeed({
  messages,
  streamingVoices,
  streamingContent,
  pendingVoices,
  ensemble,
}: MessageFeedProps): React.JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Include a content-size signal so the feed stays pinned as markdown
  // expands bubble height on each incoming token.
  const streamingContentSize = Object.values(streamingContent).join('').length;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingVoices.size, pendingVoices.size, streamingContentSize]);

  const voiceMap = Object.fromEntries(ensemble.map((v) => [v.id, v]));

  if (messages.length === 0 && streamingVoices.size === 0 && pendingVoices.size === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-600 select-none">
        <div className="empty-state">
          <Music size={40} strokeWidth={1.75} className="text-gray-300 dark:text-gray-600" />
          <p className="text-sm font-medium">The ensemble is ready.</p>
          <p className="text-xs">Send the first message to begin the performance.</p>
        </div>
      </div>
    );
  }

  // Build a flat render list in chronological order, injecting round dividers
  // at the point each new round starts (system messages are rendered inline and
  // never trigger a divider).
  const nonSystemRounds = new Set(
    messages.filter((m) => m.role !== 'system').map((m) => m.roundIndex),
  );
  const showDividers = nonSystemRounds.size > 1;

  type RenderItem =
    | { kind: 'message'; msg: Message }
    | { kind: 'divider'; roundIndex: number };

  const renderItems: RenderItem[] = [];
  let lastRound: number | null = null;
  for (const msg of messages) {
    if (msg.role !== 'system') {
      if (showDividers && msg.roundIndex > 0 && msg.roundIndex !== lastRound) {
        renderItems.push({ kind: 'divider', roundIndex: msg.roundIndex });
      }
      lastRound = msg.roundIndex;
    }
    renderItems.push({ kind: 'message', msg });
  }

  const maxRound = lastRound ?? 0;

  return (
    <div
      className="flex-1 overflow-y-auto px-6 py-4"
      role="log"
      aria-live="polite"
      aria-label="Conversation"
    >
      {renderItems.map((item) => {
        if (item.kind === 'divider') {
          return (
            <div key={`divider-${item.roundIndex}`} className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
              <span className="text-xs text-gray-400 dark:text-gray-600 font-medium px-1">
                Round {item.roundIndex + 1}
              </span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
            </div>
          );
        }
        const { msg } = item;
        const voice = msg.voiceId ? voiceMap[msg.voiceId] : undefined;
        return (
          <MessageBubble
            key={msg.id}
            message={msg}
            voiceColor={voice?.color}
            voiceName={voice?.name ?? msg.voiceName ?? undefined}
            voiceProvider={voice?.provider}
            voiceType={voice?.type}
            voiceSide={voice?.side}
          />
        );
      })}

      {/* Live streaming bubbles */}
      {[...streamingVoices].map((voiceId) => {
        const voice = voiceMap[voiceId];
        const content = streamingContent[voiceId] ?? '';
        const streamingMsg: Message = {
          id: `streaming-${voiceId}`,
          sessionId: '',
          role: 'voice',
          voiceId,
          voiceName: voice?.name ?? null,
          content,
          timestamp: Date.now(),
          roundIndex: maxRound,
        };
        return (
          <MessageBubble
            key={`streaming-${voiceId}`}
            message={streamingMsg}
            isStreaming
            streamingContent={content}
            voiceColor={voice?.color}
            voiceName={voice?.name}
            voiceProvider={voice?.provider}
            voiceType={voice?.type}
            voiceSide={voice?.side}
          />
        );
      })}

      {/* Thinking bubbles — dispatched but no tokens yet */}
      {[...pendingVoices]
        .filter((voiceId) => !streamingVoices.has(voiceId))
        .map((voiceId) => {
          const voice = voiceMap[voiceId];
          const pendingMsg: Message = {
            id: `pending-${voiceId}`,
            sessionId: '',
            role: 'voice',
            voiceId,
            voiceName: voice?.name ?? null,
            content: '',
            timestamp: Date.now(),
            roundIndex: maxRound,
          };
          return (
            <MessageBubble
              key={`pending-${voiceId}`}
              message={pendingMsg}
              isThinking
              voiceColor={voice?.color}
              voiceName={voice?.name}
              voiceProvider={voice?.provider}
              voiceType={voice?.type}
              voiceSide={voice?.side}
            />
          );
        })}

      <div ref={bottomRef} />
    </div>
  );
}
