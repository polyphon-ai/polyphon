// @vitest-environment happy-dom
import { vi } from 'vitest';

// uiStore calls localStorage.getItem at module initialization time.
// Stub localStorage before any imports so the store initializes cleanly.
vi.hoisted(() => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
    },
  });
});

import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import SessionView from './SessionView';
import { useSessionStore } from '../../store/sessionStore';
import type { Session } from '../../../shared/types';

vi.mock('./MessageFeed', () => ({ default: () => <div data-testid="message-feed" /> }));
vi.mock('./VoicePanel', () => ({ default: ({ voice }: any) => <div data-testid={`voice-panel-${voice.id}`} /> }));
vi.mock('./ConductorInput', () => ({
  default: ({ onSubmit, disabled }: any) => (
    <div>
      <button data-testid="submit-msg" disabled={disabled} onClick={() => onSubmit('test message')}>Send</button>
    </div>
  ),
}));

type PolyphonStub = {
  composition: { get: ReturnType<typeof vi.fn> };
  session: {
    listMessages: ReturnType<typeof vi.fn>;
    onContinuationPrompt: ReturnType<typeof vi.fn>;
    onNoTarget: ReturnType<typeof vi.fn>;
  };
  voice: {
    onPending: ReturnType<typeof vi.fn>;
    onToken: ReturnType<typeof vi.fn>;
    onDone: ReturnType<typeof vi.fn>;
    onError: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    abort: ReturnType<typeof vi.fn>;
  };
};

function stubPolyphon(overrides: Partial<PolyphonStub> = {}): PolyphonStub {
  const defaultPolyphon: PolyphonStub = {
    composition: {
      get: vi.fn().mockResolvedValue({
        voices: [
          {
            id: 'v-1',
            displayName: 'Alice',
            color: '#D4763B',
            avatarIcon: 'A',
            provider: 'anthropic',
            cliCommand: null,
          },
        ],
      }),
    },
    session: {
      listMessages: vi.fn().mockResolvedValue([]),
      onContinuationPrompt: vi.fn().mockReturnValue(() => {}),
      onNoTarget: vi.fn().mockReturnValue(() => {}),
    },
    voice: {
      onPending: vi.fn().mockReturnValue(() => {}),
      onToken: vi.fn().mockReturnValue(() => {}),
      onDone: vi.fn().mockReturnValue(() => {}),
      onError: vi.fn().mockReturnValue(() => {}),
      send: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn(),
    },
  };
  const merged = { ...defaultPolyphon, ...overrides };
  vi.stubGlobal('polyphon', merged);
  return merged;
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    compositionId: 'comp-1',
    name: 'My Session',
    mode: 'conductor',
    continuationPolicy: 'none',
    continuationMaxRounds: 2,
    createdAt: 1000,
    updatedAt: 1000,
    archived: false,
    workingDir: null,
    ...overrides,
  } as Session;
}

beforeEach(() => {
  useSessionStore.setState({
    sessions: [],
    activeSessionId: null,
    messages: {},
    streamingContent: {},
    streamingVoices: {},
    pendingVoices: {},
  });
  vi.unstubAllGlobals();
});

afterEach(cleanup);

describe('SessionView', () => {
  const user = userEvent.setup();

  it('renders session name in header', () => {
    stubPolyphon();
    render(<SessionView session={makeSession()} onBack={vi.fn()} />);
    expect(screen.getByText('My Session')).toBeTruthy();
  });

  it('back button calls onBack', async () => {
    stubPolyphon();
    const onBack = vi.fn();
    render(<SessionView session={makeSession()} onBack={onBack} />);
    await user.click(screen.getByRole('button', { name: 'Back to sessions' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('loads composition and renders voice panel for each voice', async () => {
    stubPolyphon();
    render(<SessionView session={makeSession()} onBack={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('voice-panel-v-1')).toBeTruthy();
    });
  });

  it('loads historical messages on mount', async () => {
    const stub = stubPolyphon();
    render(<SessionView session={makeSession()} onBack={vi.fn()} />);
    await waitFor(() => {
      expect(stub.session.listMessages).toHaveBeenCalledWith('sess-1');
    });
  });

  it('registers IPC listeners on mount and unregisters on unmount', async () => {
    const unsubToken = vi.fn();
    const unsubDone = vi.fn();
    const unsubError = vi.fn();
    const unsubContinuation = vi.fn();
    const unsubNoTarget = vi.fn();

    const unsubPending = vi.fn();
    stubPolyphon({
      voice: {
        onPending: vi.fn().mockReturnValue(unsubPending),
        onToken: vi.fn().mockReturnValue(unsubToken),
        onDone: vi.fn().mockReturnValue(unsubDone),
        onError: vi.fn().mockReturnValue(unsubError),
        send: vi.fn().mockResolvedValue(undefined),
        abort: vi.fn(),
      },
      session: {
        listMessages: vi.fn().mockResolvedValue([]),
        onContinuationPrompt: vi.fn().mockReturnValue(unsubContinuation),
        onNoTarget: vi.fn().mockReturnValue(unsubNoTarget),
      },
    });

    const { unmount } = render(<SessionView session={makeSession()} onBack={vi.fn()} />);

    const polyphon = (window as any).polyphon;
    expect(polyphon.voice.onPending).toHaveBeenCalledWith('sess-1', expect.any(Function));
    expect(polyphon.voice.onToken).toHaveBeenCalledWith('sess-1', expect.any(Function));
    expect(polyphon.voice.onDone).toHaveBeenCalledWith('sess-1', expect.any(Function));
    expect(polyphon.voice.onError).toHaveBeenCalledWith('sess-1', expect.any(Function));
    expect(polyphon.session.onContinuationPrompt).toHaveBeenCalledWith('sess-1', expect.any(Function));
    expect(polyphon.session.onNoTarget).toHaveBeenCalledWith('sess-1', expect.any(Function));

    unmount();

    expect(unsubPending).toHaveBeenCalledOnce();
    expect(unsubToken).toHaveBeenCalledOnce();
    expect(unsubDone).toHaveBeenCalledOnce();
    expect(unsubError).toHaveBeenCalledOnce();
    expect(unsubContinuation).toHaveBeenCalledOnce();
    expect(unsubNoTarget).toHaveBeenCalledOnce();
  });

  it('shows Abort button when streaming', () => {
    stubPolyphon();
    useSessionStore.setState({ streamingVoices: { 'sess-1': new Set(['v-1']) } });
    render(<SessionView session={makeSession()} onBack={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Stop generating' })).toBeTruthy();
  });

  it('Abort button is hidden when not streaming', () => {
    stubPolyphon();
    render(<SessionView session={makeSession()} onBack={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Stop generating' })).toBeNull();
  });

  it('shows voice error banner when onError callback is invoked', async () => {
    let capturedOnError: ((voiceId: string, error: string) => void) | null = null;
    stubPolyphon({
      voice: {
        onPending: vi.fn().mockReturnValue(() => {}),
        onToken: vi.fn().mockReturnValue(() => {}),
        onDone: vi.fn().mockReturnValue(() => {}),
        onError: vi.fn().mockImplementation((_sessionId, cb) => {
          capturedOnError = cb;
          return () => {};
        }),
        send: vi.fn().mockResolvedValue(undefined),
        abort: vi.fn(),
      },
    });

    render(<SessionView session={makeSession()} onBack={vi.fn()} />);

    await waitFor(() => expect(capturedOnError).not.toBeNull());
    capturedOnError!('v-1', 'Something went wrong');

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeTruthy();
    });
  });

  it('dismissing voice error removes the banner', async () => {
    let capturedOnError: ((voiceId: string, error: string) => void) | null = null;
    stubPolyphon({
      voice: {
        onPending: vi.fn().mockReturnValue(() => {}),
        onToken: vi.fn().mockReturnValue(() => {}),
        onDone: vi.fn().mockReturnValue(() => {}),
        onError: vi.fn().mockImplementation((_sessionId, cb) => {
          capturedOnError = cb;
          return () => {};
        }),
        send: vi.fn().mockResolvedValue(undefined),
        abort: vi.fn(),
      },
    });

    render(<SessionView session={makeSession()} onBack={vi.fn()} />);

    await waitFor(() => expect(capturedOnError).not.toBeNull());
    capturedOnError!('v-1', 'Dismiss me');

    await waitFor(() => {
      expect(screen.getByText('Dismiss me')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Dismiss error' }));

    await waitFor(() => {
      expect(screen.queryByText('Dismiss me')).toBeNull();
    });
  });

  it('continuation nudge is shown when onContinuationPrompt fires', async () => {
    let capturedOnContinuation: ((payload: { roundIndex: number; voiceResponses: any[] }) => void) | null = null;
    stubPolyphon({
      session: {
        listMessages: vi.fn().mockResolvedValue([]),
        onContinuationPrompt: vi.fn().mockImplementation((_sessionId, cb) => {
          capturedOnContinuation = cb;
          return () => {};
        }),
        onNoTarget: vi.fn().mockReturnValue(() => {}),
      },
    });

    render(<SessionView session={makeSession()} onBack={vi.fn()} />);

    await waitFor(() => expect(capturedOnContinuation).not.toBeNull());
    capturedOnContinuation!({ roundIndex: 1, voiceResponses: [] });

    await waitFor(() => {
      expect(screen.getByText('Let the voices go another round without your input?')).toBeTruthy();
    });
  });

  it('Yes button calls voice.send with empty content', async () => {
    let capturedOnContinuation: ((payload: { roundIndex: number; voiceResponses: any[] }) => void) | null = null;
    const stub = stubPolyphon({
      session: {
        listMessages: vi.fn().mockResolvedValue([]),
        onContinuationPrompt: vi.fn().mockImplementation((_sessionId, cb) => {
          capturedOnContinuation = cb;
          return () => {};
        }),
        onNoTarget: vi.fn().mockReturnValue(() => {}),
      },
    });

    render(<SessionView session={makeSession()} onBack={vi.fn()} />);

    await waitFor(() => expect(capturedOnContinuation).not.toBeNull());
    capturedOnContinuation!({ roundIndex: 1, voiceResponses: [] });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Yes' })).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Yes' }));

    expect(stub.voice.send).toHaveBeenCalledWith(
      'sess-1',
      expect.objectContaining({ content: 'Please continue.', sessionId: 'sess-1', role: 'conductor' }),
    );
  });

  it('Dismiss button hides the continuation nudge', async () => {
    let capturedOnContinuation: ((payload: { roundIndex: number; voiceResponses: any[] }) => void) | null = null;
    stubPolyphon({
      session: {
        listMessages: vi.fn().mockResolvedValue([]),
        onContinuationPrompt: vi.fn().mockImplementation((_sessionId, cb) => {
          capturedOnContinuation = cb;
          return () => {};
        }),
        onNoTarget: vi.fn().mockReturnValue(() => {}),
      },
    });

    render(<SessionView session={makeSession()} onBack={vi.fn()} />);

    await waitFor(() => expect(capturedOnContinuation).not.toBeNull());
    capturedOnContinuation!({ roundIndex: 1, voiceResponses: [] });

    await waitFor(() => {
      expect(screen.getByText('Let the voices go another round without your input?')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    await waitFor(() => {
      expect(screen.queryByText('Let the voices go another round without your input?')).toBeNull();
    });
  });

  it('submitting a message calls voice.send with session id', async () => {
    const stub = stubPolyphon();
    render(<SessionView session={makeSession()} onBack={vi.fn()} />);
    await user.click(screen.getByTestId('submit-msg'));
    expect(stub.voice.send).toHaveBeenCalledWith(
      'sess-1',
      expect.objectContaining({ sessionId: 'sess-1', role: 'conductor', content: 'test message' }),
    );
  });

  it('ConductorInput is disabled when streaming', () => {
    stubPolyphon();
    useSessionStore.setState({ streamingVoices: { 'sess-1': new Set(['v-1']) } });
    render(<SessionView session={makeSession()} onBack={vi.fn()} />);
    expect(screen.getByTestId('submit-msg')).toBeDisabled();
  });

  it('shows "Directed" badge for conductor mode', () => {
    stubPolyphon();
    render(<SessionView session={makeSession({ mode: 'conductor' })} onBack={vi.fn()} />);
    expect(screen.getByText('Directed')).toBeTruthy();
  });

  it('shows "Broadcast" badge for broadcast mode', () => {
    stubPolyphon();
    render(<SessionView session={makeSession({ mode: 'broadcast' })} onBack={vi.fn()} />);
    expect(screen.getByText('Broadcast')).toBeTruthy();
  });
});
