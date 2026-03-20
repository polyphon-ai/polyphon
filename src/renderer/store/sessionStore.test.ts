import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from './sessionStore';
import type { Session, Message } from './sessionStore';

function makeSession(id: string): Session {
  return { id, compositionId: 'c-1', name: 'Test', mode: 'conductor', continuationPolicy: 'none', continuationMaxRounds: 2, createdAt: 1000, updatedAt: 1000, archived: false, workingDir: null };
}

function makeMessage(id: string, sessionId: string): Message {
  return { id, sessionId, role: 'conductor', voiceId: null, voiceName: null, content: 'hi', timestamp: 1000, roundIndex: 0 };
}

beforeEach(() => {
  useSessionStore.setState({ sessions: [], activeSessionId: null, openSessionIds: [], messages: {}, streamingContent: {}, streamingVoices: {}, pendingVoices: {} });
});

describe('setActiveSession', () => {
  it('sets activeSessionId', () => {
    useSessionStore.getState().setActiveSession('s-1');
    expect(useSessionStore.getState().activeSessionId).toBe('s-1');
  });

  it('clears activeSessionId when called with null', () => {
    useSessionStore.getState().setActiveSession('s-1');
    useSessionStore.getState().setActiveSession(null);
    expect(useSessionStore.getState().activeSessionId).toBeNull();
  });
});

describe('setSessions', () => {
  it('replaces sessions array', () => {
    const sessions = [makeSession('s-1'), makeSession('s-2')];
    useSessionStore.getState().setSessions(sessions);
    expect(useSessionStore.getState().sessions).toEqual(sessions);
  });
});

describe('removeSession', () => {
  it('removes only the matching session', () => {
    useSessionStore.setState({ sessions: [makeSession('s-1'), makeSession('s-2')] });
    useSessionStore.getState().removeSession('s-1');
    const { sessions } = useSessionStore.getState();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.id).toBe('s-2');
  });

  it('also removes from openSessionIds', () => {
    useSessionStore.setState({ sessions: [makeSession('s-1'), makeSession('s-2')], openSessionIds: ['s-1', 's-2'] });
    useSessionStore.getState().removeSession('s-1');
    expect(useSessionStore.getState().openSessionIds).toEqual(['s-2']);
  });

  it('moves activeSessionId to next open session when active session is removed', () => {
    useSessionStore.setState({ sessions: [makeSession('s-1'), makeSession('s-2')], openSessionIds: ['s-1', 's-2'], activeSessionId: 's-1' });
    useSessionStore.getState().removeSession('s-1');
    expect(useSessionStore.getState().activeSessionId).toBe('s-2');
  });
});

describe('openSession', () => {
  it('adds id to front of openSessionIds and sets activeSessionId', () => {
    useSessionStore.getState().openSession('s-1');
    expect(useSessionStore.getState().openSessionIds).toEqual(['s-1']);
    expect(useSessionStore.getState().activeSessionId).toBe('s-1');
  });

  it('is idempotent — calling twice does not duplicate', () => {
    useSessionStore.getState().openSession('s-1');
    useSessionStore.getState().openSession('s-1');
    expect(useSessionStore.getState().openSessionIds).toEqual(['s-1']);
  });

  it('prepends new id and updates activeSessionId', () => {
    useSessionStore.getState().openSession('s-1');
    useSessionStore.getState().openSession('s-2');
    expect(useSessionStore.getState().openSessionIds).toEqual(['s-2', 's-1']);
    expect(useSessionStore.getState().activeSessionId).toBe('s-2');
  });
});

describe('closeSession', () => {
  it('removes id from openSessionIds', () => {
    useSessionStore.setState({ openSessionIds: ['s-1', 's-2'], activeSessionId: 's-2' });
    useSessionStore.getState().closeSession('s-1');
    expect(useSessionStore.getState().openSessionIds).toEqual(['s-2']);
  });

  it('moves focus to next open session when active session is closed', () => {
    useSessionStore.setState({ openSessionIds: ['s-1', 's-2'], activeSessionId: 's-1' });
    useSessionStore.getState().closeSession('s-1');
    expect(useSessionStore.getState().activeSessionId).toBe('s-2');
  });

  it('sets activeSessionId to null when no sessions remain', () => {
    useSessionStore.setState({ openSessionIds: ['s-1'], activeSessionId: 's-1' });
    useSessionStore.getState().closeSession('s-1');
    expect(useSessionStore.getState().activeSessionId).toBeNull();
    expect(useSessionStore.getState().openSessionIds).toEqual([]);
  });

  it('does not change activeSessionId when a non-active session is closed', () => {
    useSessionStore.setState({ openSessionIds: ['s-1', 's-2'], activeSessionId: 's-2' });
    useSessionStore.getState().closeSession('s-1');
    expect(useSessionStore.getState().activeSessionId).toBe('s-2');
  });
});

describe('setMessages', () => {
  it('sets messages for a session while preserving others', () => {
    const existing = [makeMessage('m-0', 's-0')];
    useSessionStore.setState({ messages: { 's-0': existing } });
    const newMsgs = [makeMessage('m-1', 's-1')];
    useSessionStore.getState().setMessages('s-1', newMsgs);
    const { messages } = useSessionStore.getState();
    expect(messages['s-1']).toEqual(newMsgs);
    expect(messages['s-0']).toEqual(existing);
  });
});

describe('appendMessage', () => {
  it('appends to existing messages for a session', () => {
    const first = makeMessage('m-1', 's-1');
    useSessionStore.setState({ messages: { 's-1': [first] } });
    const second = makeMessage('m-2', 's-1');
    useSessionStore.getState().appendMessage('s-1', second);
    expect(useSessionStore.getState().messages['s-1']).toEqual([first, second]);
  });

  it('creates new array when session has no messages yet', () => {
    const msg = makeMessage('m-1', 's-1');
    useSessionStore.getState().appendMessage('s-1', msg);
    expect(useSessionStore.getState().messages['s-1']).toEqual([msg]);
  });
});

describe('markVoicePending', () => {
  it('adds voiceId to a session pendingVoices set', () => {
    useSessionStore.getState().markVoicePending('s-1', 'v-1');
    expect(useSessionStore.getState().pendingVoices['s-1']?.has('v-1')).toBe(true);
  });

  it('tracks multiple pending voices per session', () => {
    useSessionStore.getState().markVoicePending('s-1', 'v-1');
    useSessionStore.getState().markVoicePending('s-1', 'v-2');
    expect(useSessionStore.getState().pendingVoices['s-1']?.has('v-1')).toBe(true);
    expect(useSessionStore.getState().pendingVoices['s-1']?.has('v-2')).toBe(true);
  });

  it('keeps pending voices isolated by session', () => {
    useSessionStore.getState().markVoicePending('s-1', 'v-1');
    useSessionStore.getState().markVoicePending('s-2', 'v-1');
    expect(useSessionStore.getState().pendingVoices['s-1']?.has('v-1')).toBe(true);
    expect(useSessionStore.getState().pendingVoices['s-2']?.has('v-1')).toBe(true);
  });
});

describe('appendToken', () => {
  it('accumulates tokens for a voice within a session', () => {
    useSessionStore.getState().appendToken('s-1', 'v-1', 'Hello');
    expect(useSessionStore.getState().streamingContent['s-1']?.['v-1']).toBe('Hello');
  });

  it('accumulates across multiple calls for the same voice', () => {
    useSessionStore.getState().appendToken('s-1', 'v-1', 'Hello');
    useSessionStore.getState().appendToken('s-1', 'v-1', ' world');
    expect(useSessionStore.getState().streamingContent['s-1']?.['v-1']).toBe('Hello world');
  });

  it('adds voiceId to the session streamingVoices set', () => {
    useSessionStore.getState().appendToken('s-1', 'v-1', 'tok');
    expect(useSessionStore.getState().streamingVoices['s-1']?.has('v-1')).toBe(true);
  });

  it('tracks multiple voices independently within a session', () => {
    useSessionStore.getState().appendToken('s-1', 'v-1', 'foo');
    useSessionStore.getState().appendToken('s-1', 'v-2', 'bar');
    const { streamingContent, streamingVoices } = useSessionStore.getState();
    expect(streamingContent['s-1']?.['v-1']).toBe('foo');
    expect(streamingContent['s-1']?.['v-2']).toBe('bar');
    expect(streamingVoices['s-1']?.has('v-1')).toBe(true);
    expect(streamingVoices['s-1']?.has('v-2')).toBe(true);
  });

  it('keeps streaming state isolated by session', () => {
    useSessionStore.getState().appendToken('s-1', 'v-1', 'foo');
    useSessionStore.getState().appendToken('s-2', 'v-1', 'bar');
    const { streamingContent, streamingVoices } = useSessionStore.getState();
    expect(streamingContent['s-1']?.['v-1']).toBe('foo');
    expect(streamingContent['s-2']?.['v-1']).toBe('bar');
    expect(streamingVoices['s-1']?.has('v-1')).toBe(true);
    expect(streamingVoices['s-2']?.has('v-1')).toBe(true);
  });

  it('removes voice from pendingVoices when first token arrives', () => {
    useSessionStore.getState().markVoicePending('s-1', 'v-1');
    expect(useSessionStore.getState().pendingVoices['s-1']?.has('v-1')).toBe(true);
    useSessionStore.getState().appendToken('s-1', 'v-1', 'tok');
    expect(useSessionStore.getState().pendingVoices['s-1']?.has('v-1')).toBe(false);
  });
});

describe('markStreamDone', () => {
  it('removes voice from session streamingVoices', () => {
    useSessionStore.getState().appendToken('s-1', 'v-1', 'tok');
    useSessionStore.getState().markStreamDone('s-1', 'v-1');
    expect(useSessionStore.getState().streamingVoices['s-1']?.has('v-1')).toBe(false);
  });

  it('clears streamingContent for that voice', () => {
    useSessionStore.getState().appendToken('s-1', 'v-1', 'tok');
    useSessionStore.getState().markStreamDone('s-1', 'v-1');
    expect(useSessionStore.getState().streamingContent['s-1']?.['v-1']).toBeUndefined();
  });

  it('does not affect other voices or sessions streaming content', () => {
    useSessionStore.getState().appendToken('s-1', 'v-1', 'foo');
    useSessionStore.getState().appendToken('s-1', 'v-2', 'bar');
    useSessionStore.getState().appendToken('s-2', 'v-1', 'baz');
    useSessionStore.getState().markStreamDone('s-1', 'v-1');
    expect(useSessionStore.getState().streamingContent['s-1']?.['v-2']).toBe('bar');
    expect(useSessionStore.getState().streamingContent['s-2']?.['v-1']).toBe('baz');
    expect(useSessionStore.getState().streamingVoices['s-1']?.has('v-2')).toBe(true);
  });

  it('does not throw for an unknown voiceId', () => {
    expect(() => useSessionStore.getState().markStreamDone('s-1', 'unknown')).not.toThrow();
  });

  it('removes voice from pendingVoices', () => {
    useSessionStore.getState().markVoicePending('s-1', 'v-1');
    useSessionStore.getState().markStreamDone('s-1', 'v-1');
    expect(useSessionStore.getState().pendingVoices['s-1']?.has('v-1')).toBe(false);
  });
});
