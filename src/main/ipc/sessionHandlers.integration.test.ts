import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../db/migrations';
import { insertComposition } from '../db/queries/compositions';
import { insertSession } from '../db/queries/sessions';
import { listMessages } from '../db/queries/messages';
import { VoiceManager } from '../managers/VoiceManager';
import { SessionManager } from '../managers/SessionManager';
import type { Composition, CompositionVoice, Message, Session } from '../../shared/types';

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  runMigrations(db);
  return db;
}

function makeVoice(overrides: Partial<CompositionVoice> = {}): CompositionVoice {
  return {
    id: 'v-1',
    compositionId: 'comp-1',
    provider: 'anthropic',
    model: 'claude-opus-4-6',
    displayName: 'Alice',
    order: 0,
    color: '#D4763B',
    avatarIcon: 'star',
    ...overrides,
  };
}

function makeComposition(): Composition {
  return {
    id: 'comp-1',
    name: 'Test',
    mode: 'broadcast',
    continuationPolicy: 'none',
    continuationMaxRounds: 1,
    voices: [makeVoice()],
    createdAt: 1000,
    updatedAt: 1000,
    archived: false,
  };
}

function makeSession(): Session {
  return {
    id: 'sess-1',
    compositionId: 'comp-1',
    name: 'Test Session',
    mode: 'broadcast',
    continuationPolicy: 'none',
    continuationMaxRounds: 1,
    createdAt: 1000,
    updatedAt: 1000,
    archived: false,
  };
}

function makeConductorMessage(sessionId = 'sess-1'): Message {
  return {
    id: 'msg-conductor',
    sessionId,
    role: 'conductor',
    voiceId: null,
    voiceName: null,
    content: 'Hello voices!',
    timestamp: 2000,
    roundIndex: 0,
  };
}

describe('SessionManager + DB integration', () => {
  let db: DatabaseSync;
  let voiceManager: VoiceManager;
  let sessionManager: SessionManager;

  beforeEach(() => {
    db = createTestDb();
    voiceManager = new VoiceManager();
    sessionManager = new SessionManager(voiceManager);
  });

  afterEach(() => {
    db.close();
  });

  describe('runBroadcastRound with mocked voice provider', () => {
    it('inserts voice response messages into DB', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession());

      // Create a mock voice that yields 3 tokens
      const mockVoice = {
        id: 'v-1',
        name: 'Alice',
        provider: 'anthropic',
        type: 'api' as const,
        color: '#fff',
        avatarIcon: 'star',
        send: vi.fn(async function* () {
          yield 'Hello';
          yield ' ';
          yield 'world';
        }),
        isAvailable: vi.fn().mockResolvedValue(true),
        abort: vi.fn(),
        setEnsembleSystemPrompt: vi.fn(),
      };

      voiceManager.initSession('sess-1', [mockVoice], 'broadcast');

      const win = {
        webContents: {
          send: vi.fn(),
        },
      } as any;

      const session = makeSession();
      const conductorMsg = makeConductorMessage();

      await sessionManager.runBroadcastRound(win, session, conductorMsg, db);

      // Voice should have been called
      expect(mockVoice.send).toHaveBeenCalledOnce();

      // Token events should have been sent
      const tokenCalls = win.webContents.send.mock.calls.filter(
        (c: any[]) => c[0] === 'voice:token:sess-1',
      );
      expect(tokenCalls).toHaveLength(3);
      expect(tokenCalls[0][1]).toEqual({ voiceId: 'v-1', token: 'Hello' });
      expect(tokenCalls[1][1]).toEqual({ voiceId: 'v-1', token: ' ' });
      expect(tokenCalls[2][1]).toEqual({ voiceId: 'v-1', token: 'world' });

      // Done event should have been sent
      const doneCalls = win.webContents.send.mock.calls.filter(
        (c: any[]) => c[0] === 'voice:done:sess-1',
      );
      expect(doneCalls).toHaveLength(1);
      expect(doneCalls[0][1]).toEqual({ voiceId: 'v-1' });

      // Message should be in DB
      const messages = listMessages(db, 'sess-1');
      expect(messages).toHaveLength(1);
      expect(messages[0]!.role).toBe('voice');
      expect(messages[0]!.voiceId).toBe('v-1');
      expect(messages[0]!.content).toBe('Hello world');
    });

    it('passes accumulated context to each voice in sequence', async () => {
      const voice1Responses: Message[][] = [];
      const voice2Responses: Message[][] = [];

      const mockVoice1 = {
        id: 'v-1',
        name: 'Alice',
        provider: 'anthropic',
        type: 'api' as const,
        color: '#fff',
        avatarIcon: 'star',
        send: vi.fn(async function* (_msg: Message, ctx: Message[]) {
          voice1Responses.push([...ctx]);
          yield 'Alice reply';
        }),
        isAvailable: vi.fn().mockResolvedValue(true),
        abort: vi.fn(),
        setEnsembleSystemPrompt: vi.fn(),
      };

      const mockVoice2 = {
        id: 'v-2',
        name: 'Bob',
        provider: 'openai',
        type: 'api' as const,
        color: '#fff',
        avatarIcon: 'circle',
        send: vi.fn(async function* (_msg: Message, ctx: Message[]) {
          voice2Responses.push([...ctx]);
          yield 'Bob reply';
        }),
        isAvailable: vi.fn().mockResolvedValue(true),
        abort: vi.fn(),
        setEnsembleSystemPrompt: vi.fn(),
      };

      insertComposition(db, {
        ...makeComposition(),
        voices: [
          makeVoice({ id: 'v-1', displayName: 'Alice', order: 0 }),
          makeVoice({ id: 'v-2', displayName: 'Bob', order: 1, compositionId: 'comp-1' }),
        ],
      });
      insertSession(db, makeSession());
      voiceManager.initSession('sess-1', [mockVoice1, mockVoice2], 'broadcast');

      const win = { webContents: { send: vi.fn() } } as any;
      const session = makeSession();
      const conductorMsg = makeConductorMessage();

      await sessionManager.runBroadcastRound(win, session, conductorMsg, db);

      // Voice2 should see conductorMsg + Alice's response in context
      expect(voice2Responses[0]!.length).toBe(voice1Responses[0]!.length + 1);
      const lastInV2Context = voice2Responses[0]![voice2Responses[0]!.length - 1];
      expect(lastInV2Context!.role).toBe('voice');
      expect(lastInV2Context!.voiceName).toBe('Alice');
    });
  });

  describe('runDirectedRound with mocked voice provider', () => {
    it('only calls the targeted voice', async () => {
      const mockVoice1 = {
        id: 'v-1',
        name: 'Alice',
        provider: 'anthropic',
        type: 'api' as const,
        color: '#fff',
        avatarIcon: 'star',
        send: vi.fn(async function* () { yield 'Alice reply'; }),
        isAvailable: vi.fn().mockResolvedValue(true),
        abort: vi.fn(),
        setEnsembleSystemPrompt: vi.fn(),
      };
      const mockVoice2 = {
        id: 'v-2',
        name: 'Bob',
        provider: 'openai',
        type: 'api' as const,
        color: '#fff',
        avatarIcon: 'circle',
        send: vi.fn(async function* () { yield 'Bob reply'; }),
        isAvailable: vi.fn().mockResolvedValue(true),
        abort: vi.fn(),
        setEnsembleSystemPrompt: vi.fn(),
      };

      insertSession(db, makeSession());
      voiceManager.initSession('sess-1', [mockVoice1, mockVoice2], 'broadcast');

      const win = { webContents: { send: vi.fn() } } as any;
      const session = makeSession();
      const conductorMsg = makeConductorMessage();

      await sessionManager.runDirectedRound(win, session, conductorMsg, 'v-2', db);

      expect(mockVoice1.send).not.toHaveBeenCalled();
      expect(mockVoice2.send).toHaveBeenCalledOnce();

      const messages = listMessages(db, 'sess-1');
      expect(messages[0]!.voiceId).toBe('v-2');
      expect(messages[0]!.content).toBe('Bob reply');
    });
  });
});
