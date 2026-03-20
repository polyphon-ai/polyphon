// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(cleanup);

import MessageBubble from './MessageBubble';
import type { Message } from '../../../shared/types';

const DECRYPTION_FAILED_SENTINEL = '\u0000[decryption-failed]\u0000';

beforeEach(() => {
  (window as unknown as Record<string, unknown>).polyphon = {
    shell: { openExternal: vi.fn() },
  };
  document.documentElement.classList.remove('dark');
});

function makeVoiceMsg(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    sessionId: 'sess-1',
    role: 'voice',
    voiceId: 'v1',
    voiceName: 'Alice',
    content: 'Hello from Alice',
    timestamp: Date.now(),
    roundIndex: 0,
    ...overrides,
  };
}

function makeConductorMsg(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-2',
    sessionId: 'sess-1',
    role: 'conductor',
    voiceId: null,
    voiceName: null,
    content: 'Hello from conductor',
    timestamp: Date.now(),
    roundIndex: 0,
    ...overrides,
  };
}

describe('MessageBubble', () => {
  it('voice message renders via MarkdownContent (prose-voice wrapper present)', () => {
    const { container } = render(
      <MessageBubble
        message={makeVoiceMsg({ content: 'A **bold** message' })}
      />,
    );
    expect(container.querySelector('.prose-voice')).toBeTruthy();
    expect(container.querySelector('strong')).toBeTruthy();
  });

  it('conductor message renders via MarkdownContent', () => {
    const { container } = render(
      <MessageBubble
        message={makeConductorMsg({ content: '_italic conductor_' })}
      />,
    );
    expect(container.querySelector('.prose-voice')).toBeTruthy();
    expect(container.querySelector('em')).toBeTruthy();
  });

  it('decryption-failed sentinel renders as [Message unavailable]', () => {
    render(
      <MessageBubble
        message={makeVoiceMsg({ content: DECRYPTION_FAILED_SENTINEL })}
      />,
    );
    expect(screen.getByText('[Message unavailable]')).toBeTruthy();
  });

  it('conductor decryption-failed sentinel renders as [Message unavailable]', () => {
    render(
      <MessageBubble
        message={makeConductorMsg({ content: DECRYPTION_FAILED_SENTINEL })}
      />,
    );
    expect(screen.getByText('[Message unavailable]')).toBeTruthy();
  });

  it('isThinking renders animated dots, not markdown', () => {
    const { container } = render(
      <MessageBubble
        message={makeVoiceMsg({ content: '' })}
        isThinking
      />,
    );
    expect(screen.getByLabelText('Thinking')).toBeTruthy();
    // No prose-voice wrapper for thinking state
    expect(container.querySelector('.prose-voice')).toBeNull();
  });

  it('system message renders as plain divider text, not markdown', () => {
    render(
      <MessageBubble
        message={makeVoiceMsg({ role: 'system', content: 'Session started' })}
      />,
    );
    expect(screen.getByText('Session started')).toBeTruthy();
  });

  it('isStreaming badge appears during streaming', () => {
    render(
      <MessageBubble
        message={makeVoiceMsg()}
        isStreaming
        streamingContent="typing..."
      />,
    );
    expect(screen.getByText('streaming')).toBeTruthy();
  });

  it('left alignment is default (no flex-row-reverse on voice bubble)', () => {
    const { container } = render(
      <MessageBubble
        message={makeVoiceMsg()}
        voiceSide="left"
      />,
    );
    const article = container.querySelector('[role="article"]')!;
    expect(article.className).not.toContain('flex-row-reverse');
  });

  it('right alignment applies flex-row-reverse on voice bubble', () => {
    const { container } = render(
      <MessageBubble
        message={makeVoiceMsg()}
        voiceSide="right"
      />,
    );
    const article = container.querySelector('[role="article"]')!;
    expect(article.className).toContain('flex-row-reverse');
  });
});
