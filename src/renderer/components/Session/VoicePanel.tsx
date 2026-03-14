import React from 'react';
import type { VoiceDescriptor } from '../../../shared/types';
import ProviderLogo from '../Shared/ProviderLogo';

export interface VoicePanelProps {
  voice: VoiceDescriptor;
  isStreaming: boolean;
  isPending?: boolean;
  expanded: boolean;
}

// Avatar with an activity ring overlaid directly on it.
// Pending  → slow-rotating dashed amber ring (signals "thinking")
// Streaming → solid pulsing ring in the voice's own color (signals active output)
function VoiceAvatar({
  voice,
  size,
  logoSize,
  isStreaming,
  isPending,
}: {
  voice: VoiceDescriptor;
  size: number;
  logoSize: number;
  isStreaming: boolean;
  isPending: boolean;
}): React.JSX.Element {
  const showRing = isStreaming || isPending;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {showRing && (
        <div
          aria-hidden="true"
          className="absolute rounded-full pointer-events-none"
          style={{
            inset: -3,
            borderRadius: '50%',
            border: isStreaming
              ? `2px solid ${voice.color}`
              : '2px dashed #f59e0b',
            boxShadow: isStreaming ? `0 0 7px ${voice.color}70` : undefined,
            animation: isStreaming
              ? 'pulse 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite'
              : 'spin 3s linear infinite',
          }}
        />
      )}
      <div
        className="w-full h-full rounded-full flex items-center justify-center"
        style={{ backgroundColor: `${voice.color}25` }}
      >
        <ProviderLogo
          provider={voice.provider}
          size={logoSize}
          color={voice.color}
          fallbackInitial={voice.name.charAt(0).toUpperCase()}
        />
      </div>
    </div>
  );
}

export default function VoicePanel({
  voice,
  isStreaming,
  isPending = false,
  expanded,
}: VoicePanelProps): React.JSX.Element {
  if (!expanded) {
    return (
      <div
        aria-label={`Voice: ${voice.name}${isStreaming ? ' — streaming' : isPending ? ' — thinking' : ''}`}
        className="w-12 flex flex-col items-center py-3"
        title={voice.name}
      >
        <VoiceAvatar
          voice={voice}
          size={32}
          logoSize={18}
          isStreaming={isStreaming}
          isPending={isPending}
        />
      </div>
    );
  }

  return (
    <div
      aria-label={`Voice: ${voice.name}${isStreaming ? ' — streaming' : isPending ? ' — thinking' : ''}`}
      className="w-48 bg-white dark:bg-gray-900 flex flex-col"
      style={{ borderLeft: `3px solid ${voice.color}` }}
    >
      <div className="flex items-center gap-2 px-3 py-3">
        <VoiceAvatar
          voice={voice}
          size={28}
          logoSize={16}
          isStreaming={isStreaming}
          isPending={isPending}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {voice.name}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {voice.provider !== 'openai-compat' && (
              <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
                {voice.provider}
              </span>
            )}
            <span className="text-[10px] px-1 py-px rounded bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 font-medium shrink-0">
              {voice.provider === 'openai-compat' ? 'Custom' : voice.type === 'cli' ? 'CLI' : 'API'}
            </span>
          </div>
        </div>
      </div>

      {isStreaming && (
        <div
          className="flex items-end gap-0.5 h-5 px-3 pb-3"
          aria-label="Streaming"
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="w-1 rounded-sm origin-bottom"
              style={{
                backgroundColor: voice.color,
                height: '100%',
                animation: 'waveform 0.8s ease-in-out infinite',
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
      )}

      {isPending && !isStreaming && (
        <div
          className="flex items-center gap-1 px-3 pb-3"
          aria-label="Thinking"
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="inline-block w-1.5 h-1.5 rounded-full animate-bounce"
              style={{ backgroundColor: '#f59e0b', opacity: 0.7, animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
