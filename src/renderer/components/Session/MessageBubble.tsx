import React from 'react';
import { Wand2 } from 'lucide-react';
import type { Message } from '../../../shared/types';
import ProviderLogo from '../Shared/ProviderLogo';
import { useSettingsStore } from '../../store/settingsStore';
import MarkdownContent from './MarkdownContent';

const DECRYPTION_FAILED_SENTINEL = '\u0000[decryption-failed]\u0000';

export interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  isThinking?: boolean;
  streamingContent?: string;
  voiceColor?: string;
  voiceName?: string;
  voiceProvider?: string;
  voiceType?: 'api' | 'cli';
  voiceSide?: 'left' | 'right';
}


function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MessageBubble({
  message,
  isStreaming = false,
  isThinking = false,
  streamingContent,
  voiceColor,
  voiceName,
  voiceProvider,
  voiceType,
  voiceSide = 'left',
}: MessageBubbleProps): React.JSX.Element {
  const conductorColor = useSettingsStore((s) => s.userProfile.conductorColor);
  const conductorName = useSettingsStore((s) => s.userProfile.conductorName);
  const conductorAvatar = useSettingsStore((s) => s.userProfile.conductorAvatar);

  const rawContent = streamingContent ?? message.content;
  const isDecryptionFailed = rawContent === DECRYPTION_FAILED_SENTINEL;
  const content = isDecryptionFailed ? '[Message unavailable]' : rawContent;
  const isConductor = message.role === 'conductor';
  const displayContent = content;

  if (message.role === 'system') {
    return (
      <div className="flex items-center gap-3 my-3 select-none">
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
        <span className="text-xs text-gray-400 dark:text-gray-500 px-2 shrink-0">
          {message.content}
        </span>
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  if (isConductor) {
    const color = conductorColor || '#6b7280';
    const bgColor = `${color}15`;
    const displayConductorName = conductorName || 'Conductor';

    return (
      <div role="article" aria-label="Your message" className="flex flex-row-reverse gap-3 mb-4">
        {/* Conductor avatar */}
        <div
          className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center shrink-0 mt-1"
          style={{ backgroundColor: conductorAvatar ? undefined : `${color}25` }}
        >
          {conductorAvatar ? (
            <img src={conductorAvatar} alt="" className="w-full h-full object-cover" />
          ) : (
            <Wand2 size={18} strokeWidth={1.75} style={{ color }} />
          )}
        </div>

        <div className="w-fit min-w-0 max-w-[85%]">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1.5 flex-wrap justify-end">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {displayConductorName}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
              conductor
            </span>
          </div>

          {/* Content bubble */}
          <div
            className="rounded-2xl rounded-tr-sm px-4 py-3 text-sm text-gray-900 dark:text-gray-100 break-words"
            style={{ borderRight: `3px solid ${color}`, backgroundColor: bgColor }}
          >
            <MarkdownContent content={displayContent} isStreaming={isStreaming} />
          </div>

          <div className="text-xs text-gray-400 dark:text-gray-600 mt-1 text-right">
            {formatTime(message.timestamp)}
          </div>
        </div>
      </div>
    );
  }

  const borderColor = voiceColor ?? '#6366f1';
  const bgColor = voiceColor ? `${voiceColor}15` : 'rgba(99,102,241,0.08)';
  const displayName = message.voiceName ?? voiceName ?? 'Voice';
  const isRight = voiceSide === 'right';

  return (
    <div
      role="article"
      aria-label={`Message from ${displayName}`}
      className={`flex gap-3 mb-4${isRight ? ' flex-row-reverse' : ''}`}
    >
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1"
        style={{ backgroundColor: `${borderColor}25` }}
      >
        <ProviderLogo provider={voiceProvider ?? ''} size={18} color={borderColor} fallbackInitial={displayName.charAt(0).toUpperCase()} />
      </div>

      <div className="w-fit min-w-0 max-w-[85%]">
        {/* Header */}
        <div className={`flex items-center gap-2 mb-1.5 flex-wrap${isRight ? ' justify-end' : ''}`}>
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {displayName}
          </span>
          {voiceProvider && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
              {voiceProvider}
            </span>
          )}
          {voiceProvider && (
            <span className="text-[10px] px-1 py-px rounded bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 font-medium">
              {voiceProvider === 'openai-compat' ? 'Custom' : voiceType === 'cli' ? 'CLI' : 'API'}
            </span>
          )}
          {isStreaming && (
            <span className="flex items-center gap-1 text-xs text-indigo-500 dark:text-indigo-400">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              streaming
            </span>
          )}
          {isThinking && (
            <span className="flex items-center gap-1 text-xs text-amber-500 dark:text-amber-400">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              thinking
            </span>
          )}
        </div>

        {/* Content bubble */}
        <div
          className={`rounded-2xl px-4 py-3 text-sm text-gray-900 dark:text-gray-100 break-words${isRight ? ' rounded-tr-sm' : ' rounded-tl-sm'}`}
          style={{
            borderLeft: isRight ? undefined : `3px solid ${borderColor}`,
            borderRight: isRight ? `3px solid ${borderColor}` : undefined,
            backgroundColor: bgColor,
          }}
        >
          {isThinking ? (
            <span className="flex items-center gap-1 py-0.5" aria-label="Thinking">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="inline-block w-2 h-2 rounded-full animate-bounce"
                  style={{ backgroundColor: borderColor, opacity: 0.7, animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </span>
          ) : (
            <MarkdownContent content={displayContent} isStreaming={isStreaming} />
          )}
        </div>

        {!isThinking && (
          <div className={`text-xs text-gray-400 dark:text-gray-600 mt-1${isRight ? ' text-right' : ''}`}>
            {formatTime(message.timestamp)}
          </div>
        )}
      </div>
    </div>
  );
}
