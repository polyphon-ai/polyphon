// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(cleanup);
import MessageFeed from './MessageFeed';
import { useSettingsStore } from '../../store/settingsStore';
import type { Message, VoiceDescriptor } from '../../../shared/types';

const ensemble: VoiceDescriptor[] = [
  {
    id: 'v1',
    name: 'Alice',
    type: 'api',
    provider: 'anthropic',
    color: '#D4763B',
    avatarIcon: 'A',
    side: 'left',
  },
];

function makeMsg(overrides: Partial<Message> = {}): Message {
  return {
    id: `msg-${Math.random()}`,
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

describe('MessageFeed', () => {
  it('renders empty state when no messages and no streaming', () => {
    render(
      <MessageFeed
        messages={[]}
        streamingVoices={new Set()}
        streamingContent={{}}
        pendingVoices={new Set()}
        ensemble={ensemble}
      />,
    );
    expect(screen.getByText('The ensemble is ready.')).toBeTruthy();
  });

  it('renders messages', () => {
    const msg = makeMsg({ content: 'Hello world' });
    render(
      <MessageFeed
        messages={[msg]}
        streamingVoices={new Set()}
        streamingContent={{}}
        pendingVoices={new Set()}
        ensemble={ensemble}
      />,
    );
    expect(screen.getByText('Hello world')).toBeTruthy();
  });

  it('renders streaming bubble when voice is streaming', () => {
    render(
      <MessageFeed
        messages={[]}
        streamingVoices={new Set(['v1'])}
        streamingContent={{ v1: 'Partial response...' }}
        pendingVoices={new Set()}
        ensemble={ensemble}
      />,
    );
    expect(screen.getByText('Partial response...')).toBeTruthy();
    expect(screen.getByLabelText('streaming')).toBeTruthy();
  });

  it('shows streaming indicator text when streaming', () => {
    render(
      <MessageFeed
        messages={[makeMsg()]}
        streamingVoices={new Set(['v1'])}
        streamingContent={{ v1: 'live content' }}
        pendingVoices={new Set()}
        ensemble={ensemble}
      />,
    );
    expect(screen.getByLabelText('streaming')).toBeTruthy();
    expect(screen.getByText('live content')).toBeTruthy();
  });

  it('renders thinking bubble when voice is pending', () => {
    render(
      <MessageFeed
        messages={[]}
        streamingVoices={new Set()}
        streamingContent={{}}
        pendingVoices={new Set(['v1'])}
        ensemble={ensemble}
      />,
    );
    expect(screen.getByLabelText('thinking')).toBeTruthy();
    expect(screen.getByLabelText('Thinking')).toBeTruthy();
  });

  it('does not show empty state when pending even with no messages', () => {
    render(
      <MessageFeed
        messages={[]}
        streamingVoices={new Set()}
        streamingContent={{}}
        pendingVoices={new Set(['v1'])}
        ensemble={ensemble}
      />,
    );
    expect(screen.queryByText('The ensemble is ready.')).toBeNull();
  });

  it('does not show empty state when streaming even with no messages', () => {
    render(
      <MessageFeed
        messages={[]}
        streamingVoices={new Set(['v1'])}
        streamingContent={{ v1: '' }}
        pendingVoices={new Set()}
        ensemble={ensemble}
      />,
    );
    expect(screen.queryByText('The ensemble is ready.')).toBeNull();
  });

  it('renders round dividers when multiple rounds present', () => {
    const msgs = [
      makeMsg({ id: 'm1', roundIndex: 0, content: 'Round zero' }),
      makeMsg({ id: 'm2', roundIndex: 1, content: 'Round one' }),
    ];
    render(
      <MessageFeed
        messages={msgs}
        streamingVoices={new Set()}
        streamingContent={{}}
        pendingVoices={new Set()}
        ensemble={ensemble}
      />,
    );
    expect(screen.getByText('Round 2')).toBeTruthy(); // roundIndex 1 → "Round 2"
  });

  it('does not show round dividers for single round', () => {
    const msgs = [
      makeMsg({ id: 'm1', roundIndex: 0, content: 'Message A' }),
      makeMsg({ id: 'm2', roundIndex: 0, content: 'Message B' }),
    ];
    render(
      <MessageFeed
        messages={msgs}
        streamingVoices={new Set()}
        streamingContent={{}}
        pendingVoices={new Set()}
        ensemble={ensemble}
      />,
    );
    expect(screen.queryByText(/Round \d/)).toBeNull();
  });

  it('renders conductor messages with "Your message" accessible label', () => {
    const conductorMsg = makeMsg({
      role: 'conductor',
      voiceId: null,
      voiceName: null,
      content: 'Direct message',
    });
    render(
      <MessageFeed
        messages={[conductorMsg]}
        streamingVoices={new Set()}
        streamingContent={{}}
        pendingVoices={new Set()}
        ensemble={ensemble}
      />,
    );
    expect(screen.getByText('Direct message')).toBeTruthy();
    expect(screen.getByRole('article', { name: 'Your message' })).toBeTruthy();
  });

  it('conductor message renders with a profile avatar element', () => {
    const conductorMsg = makeMsg({
      role: 'conductor',
      voiceId: null,
      voiceName: null,
      content: 'Has avatar',
    });
    render(
      <MessageFeed
        messages={[conductorMsg]}
        streamingVoices={new Set()}
        streamingContent={{}}
        pendingVoices={new Set()}
        ensemble={ensemble}
      />,
    );
    // The conductor bubble is right-aligned; the User icon SVG is rendered alongside it
    const article = screen.getByRole('article', { name: 'Your message' });
    // Avatar is a sibling div — verify the article contains an SVG (the User icon)
    const svgs = article.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('conductor message renders without error when conductorColor is set in settings store', () => {
    useSettingsStore.setState({
      userProfile: {
        conductorName: 'Jordan',
        pronouns: '',
        conductorContext: '',
        defaultTone: 'collaborative',
        conductorColor: '#6366f1',
        conductorAvatar: '',
        preferMarkdown: true,
        updatedAt: 0,
      },
    });
    const conductorMsg = makeMsg({
      role: 'conductor',
      voiceId: null,
      voiceName: null,
      content: 'Colored avatar message',
    });
    render(
      <MessageFeed
        messages={[conductorMsg]}
        streamingVoices={new Set()}
        streamingContent={{}}
        pendingVoices={new Set()}
        ensemble={ensemble}
      />,
    );
    expect(screen.getByText('Colored avatar message')).toBeTruthy();
    expect(screen.getByRole('article', { name: 'Your message' })).toBeTruthy();
  });

  describe('voice message side alignment', () => {
    it('left-side voice message has accessible label from voice name', () => {
      const leftVoice: VoiceDescriptor = { ...ensemble[0]!, side: 'left' };
      const msg = makeMsg({ content: 'Left side message' });
      render(
        <MessageFeed
          messages={[msg]}
          streamingVoices={new Set()}
          streamingContent={{}}
        pendingVoices={new Set()}
          ensemble={[leftVoice]}
        />,
      );
      expect(screen.getByRole('article', { name: /Message from Alice/i })).toBeTruthy();
    });

    it('right-side voice message renders the message content', () => {
      const rightVoice: VoiceDescriptor = { ...ensemble[0]!, side: 'right' };
      const msg = makeMsg({ content: 'Right side content' });
      render(
        <MessageFeed
          messages={[msg]}
          streamingVoices={new Set()}
          streamingContent={{}}
        pendingVoices={new Set()}
          ensemble={[rightVoice]}
        />,
      );
      expect(screen.getByText('Right side content')).toBeTruthy();
      expect(screen.getByRole('article', { name: /Message from Alice/i })).toBeTruthy();
    });
  });
});
