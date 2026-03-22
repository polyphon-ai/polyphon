import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SessionManager } from './SessionManager';
import { VoiceManager } from './VoiceManager';
import { CREATE_TABLES_SQL } from '../db/schema';
import { runMigrations } from '../db/migrations';
import { listMessages, insertMessage } from '../db/queries/messages';
import { IPC } from '../../shared/constants';
import type { Session, Message } from '../../shared/types';


function makeSessionManager(): SessionManager {
  return new SessionManager(new VoiceManager());
}

describe('SessionManager.parseMention', () => {
  const sm = makeSessionManager();
  const voices = ['Alice', 'Bob', 'Charlie'];

  it('returns voice name when @mention is present', () => {
    expect(sm.parseMention('@Alice what do you think?', voices)).toBe('Alice');
  });

  it('returns null when no @mention present', () => {
    expect(sm.parseMention('what does everyone think?', voices)).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(sm.parseMention('@alice thoughts?', voices)).toBe('Alice');
    expect(sm.parseMention('@ALICE thoughts?', voices)).toBe('Alice');
  });

  it('returns the first @mention when multiple are present', () => {
    expect(sm.parseMention('@Bob and @Alice agree?', voices)).toBe('Bob');
  });

  it('does not match partial names', () => {
    expect(sm.parseMention('@Alicia is here', voices)).toBeNull();
  });

  it('returns null for empty content', () => {
    expect(sm.parseMention('', voices)).toBeNull();
  });

  it('matches at start of string', () => {
    expect(sm.parseMention('@Charlie go first', voices)).toBe('Charlie');
  });

  it('matches at end of string', () => {
    expect(sm.parseMention('Your turn @Bob', voices)).toBe('Bob');
  });
});

describe('VoiceManager.buildEnsembleSystemPrompt', () => {
  let vm: VoiceManager;
  let testDb: Database.Database;

  beforeAll(() => {
    vm = new VoiceManager();
    // Load tones from a real in-memory DB so tone resolution works
    testDb = new Database(':memory:');
    testDb.exec('PRAGMA journal_mode = WAL');
    runMigrations(testDb);
    vm.loadTones(testDb);
  });

  afterAll(() => {
    testDb.close();
  });

  function makeVoice(id: string, name: string, provider = 'anthropic') {
    return { id, name, provider, type: 'api' as const, color: '#fff', avatarIcon: 'star' };
  }

  it('for a solo voice, mentions it is the only voice', () => {
    const voice = makeVoice('v1', 'Alice');
    const prompt = vm.buildEnsembleSystemPrompt(voice as any, [voice] as any, 'broadcast');
    expect(prompt).toContain('You are the only voice in this session');
    expect(prompt).toContain('Alice');
  });

  it('for two voices, lists the other voice', () => {
    const alice = makeVoice('v1', 'Alice');
    const bob = makeVoice('v2', 'Bob', 'openai');
    const ensemble = [alice, bob];

    const prompt = vm.buildEnsembleSystemPrompt(alice as any, ensemble as any, 'broadcast');
    expect(prompt).toContain('Bob');
    expect(prompt).not.toMatch(/- Alice/);
  });

  it('excludes itself from the others list', () => {
    const alice = makeVoice('v1', 'Alice');
    const bob = makeVoice('v2', 'Bob');
    const charlie = makeVoice('v3', 'Charlie');
    const ensemble = [alice, bob, charlie];

    const prompt = vm.buildEnsembleSystemPrompt(bob as any, ensemble as any, 'broadcast');
    expect(prompt).toContain('Alice');
    expect(prompt).toContain('Charlie');
    // Bob should be referenced in the identity line but not in the roster
    expect(prompt).toContain('You are Bob');
    const rosterSection = prompt.split('The other participants')[1] ?? '';
    expect(rosterSection).not.toContain('- Bob');
  });

  it('includes provider name in roster', () => {
    const alice = makeVoice('v1', 'Alice', 'anthropic');
    const bob = makeVoice('v2', 'Bob', 'openai');

    const prompt = vm.buildEnsembleSystemPrompt(alice as any, [alice, bob] as any, 'broadcast');
    expect(prompt).toContain('openai');
  });

  it('includes conductorName, conductorContext, and tone description when profile is provided', () => {
    const alice = makeVoice('v1', 'Alice');
    const profile = {
      conductorName: 'Jordan',
      pronouns: '',
      conductorContext: 'Lead engineer working on distributed systems.',
      defaultTone: 'concise' as const,
      conductorColor: '',
      conductorAvatar: '',
      preferMarkdown: false,
      updatedAt: 0,
    };

    const prompt = vm.buildEnsembleSystemPrompt(alice as any, [alice] as any, 'broadcast', profile);
    expect(prompt).toContain('Jordan');
    expect(prompt).toContain('Lead engineer working on distributed systems.');
    expect(prompt).toContain('Keep answers short unless asked for depth. No preamble or padding.');
  });

  it('conductor mode instructs voice not to direct questions at other voices', () => {
    const alice = makeVoice('v1', 'Alice');
    const bob = makeVoice('v2', 'Bob', 'openai');

    const prompt = vm.buildEnsembleSystemPrompt(alice as any, [alice, bob] as any, 'conductor');
    expect(prompt).toContain('conductor-directed session');
    expect(prompt).toContain('only respond when addressed directly');
    expect(prompt).not.toContain('broadcast session');
  });

  it('broadcast mode instructs voice to respond to all and reference others', () => {
    const alice = makeVoice('v1', 'Alice');
    const bob = makeVoice('v2', 'Bob', 'openai');

    const prompt = vm.buildEnsembleSystemPrompt(alice as any, [alice, bob] as any, 'broadcast');
    expect(prompt).toContain('broadcast session');
    expect(prompt).not.toContain('conductor-directed session');
  });
});

describe('SessionManager.incrementRound', () => {
  it('starts at 1 for a new session', () => {
    const sm = makeSessionManager();
    expect(sm.incrementRound('s1')).toBe(1);
  });

  it('increments on each call', () => {
    const sm = makeSessionManager();
    sm.incrementRound('s1');
    sm.incrementRound('s1');
    expect(sm.incrementRound('s1')).toBe(3);
  });

  it('tracks separate sessions independently', () => {
    const sm = makeSessionManager();
    sm.incrementRound('s1');
    sm.incrementRound('s1');
    expect(sm.incrementRound('s2')).toBe(1);
    expect(sm.incrementRound('s1')).toBe(3);
  });

  it('resets after disposeSession', () => {
    const sm = makeSessionManager();
    sm.incrementRound('s1');
    sm.incrementRound('s1');
    sm.disposeSession('s1');
    expect(sm.incrementRound('s1')).toBe(1);
  });
});

describe('maskApiKey', () => {
  it('is tested via env.test.ts — skipped here', () => {
    // No-op: maskApiKey has its own test file
    expect(true).toBe(true);
  });
});

describe('SessionManager.parseMention edge cases', () => {
  const sm = makeSessionManager();
  const voices = ['GPT', 'Claude', 'Gemini'];

  it('handles punctuation after name', () => {
    expect(sm.parseMention('@GPT, what do you think?', voices)).toBe('GPT');
  });

  it('does not match name inside another word', () => {
    expect(sm.parseMention('I said Claudes answer was good', voices)).toBeNull();
  });

  it('returns null for voices list with no match', () => {
    const result = sm.parseMention('@Unknown voice', voices);
    expect(result).toBeNull();
  });
});

// ── Round orchestration ───────────────────────────────────────────────────────

function makeTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(CREATE_TABLES_SQL);
  // Insert a minimal session row so message FK constraints pass
  db.exec(`
    INSERT INTO sessions (id, composition_id, name, mode, continuation_policy, continuation_max_rounds, created_at, updated_at, archived)
    VALUES ('sess-1', 'comp-1', 'Test', 'broadcast', 'none', 1, 0, 0, 0)
  `);
  return db;
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    name: 'Test Session',
    compositionId: 'comp-1',
    mode: 'broadcast',
    continuationPolicy: 'none',
    continuationMaxRounds: 1,
    createdAt: 0,
    updatedAt: 0,
    archived: false,
    workingDir: null,
    ...overrides,
  } as Session;
}

function makeConductorMessage(content = 'Hello everyone'): Message {
  return {
    id: 'msg-conductor',
    sessionId: 'sess-1',
    role: 'conductor',
    voiceId: null,
    voiceName: null,
    content,
    timestamp: 0,
    roundIndex: 0,
  };
}

function makeVoiceMock(id: string, name: string, response: string) {
  return {
    id,
    name,
    send: vi.fn().mockImplementation(async function* () {
      yield response;
    }),
  };
}

function makeWin() {
  return { webContents: { send: vi.fn() } };
}

function makeVoiceManager(voices: ReturnType<typeof makeVoiceMock>[]) {
  const vm = new VoiceManager();
  vi.spyOn(vm, 'getEnsemble').mockReturnValue(voices as any);
  vi.spyOn(vm, 'getVoice').mockImplementation((_sid, voiceId) => {
    return voices.find((v) => v.id === voiceId) as any ?? null;
  });
  return vm;
}

describe('SessionManager.runBroadcastRound', () => {
  let db: Database.Database;
  let win: ReturnType<typeof makeWin>;

  beforeEach(() => {
    db = makeTestDb();
    win = makeWin();
  });

  afterEach(() => {
  });

  it('calls send() on every voice in the ensemble', async () => {
    const alice = makeVoiceMock('v-alice', 'Alice', 'I am Alice');
    const bob = makeVoiceMock('v-bob', 'Bob', 'I am Bob');
    const sm = new SessionManager(makeVoiceManager([alice, bob]));

    const msg = makeConductorMessage();
    insertMessage(db, msg);

    await sm.runBroadcastRound(win as any, makeSession(), msg, db);

    expect(alice.send).toHaveBeenCalledOnce();
    expect(bob.send).toHaveBeenCalledOnce();
  });

  it('persists a voice message to the DB for each voice', async () => {
    const alice = makeVoiceMock('v-alice', 'Alice', 'Alice response');
    const bob = makeVoiceMock('v-bob', 'Bob', 'Bob response');
    const sm = new SessionManager(makeVoiceManager([alice, bob]));

    const msg = makeConductorMessage();
    insertMessage(db, msg);

    await sm.runBroadcastRound(win as any, makeSession(), msg, db);

    const saved = listMessages(db, 'sess-1').filter((m) => m.role === 'voice');
    expect(saved).toHaveLength(2);
    expect(saved.map((m) => m.voiceId)).toEqual(
      expect.arrayContaining(['v-alice', 'v-bob']),
    );
  });

  it('does not continue when continuationPolicy is none', async () => {
    const alice = makeVoiceMock('v-alice', 'Alice', '@Bob great point');
    const bob = makeVoiceMock('v-bob', 'Bob', '@Alice agreed');
    const sm = new SessionManager(makeVoiceManager([alice, bob]));

    const msg = makeConductorMessage();
    insertMessage(db, msg);

    await sm.runBroadcastRound(win as any, makeSession({ continuationPolicy: 'none' }), msg, db);

    // Each voice called exactly once — no continuation
    expect(alice.send).toHaveBeenCalledOnce();
    expect(bob.send).toHaveBeenCalledOnce();
  });

  it('emits SESSION_CONTINUATION_PROMPT when policy is prompt', async () => {
    const alice = makeVoiceMock('v-alice', 'Alice', 'Alice done');
    const bob = makeVoiceMock('v-bob', 'Bob', 'Bob done');
    const sm = new SessionManager(makeVoiceManager([alice, bob]));

    const msg = makeConductorMessage();
    insertMessage(db, msg);

    await sm.runBroadcastRound(win as any, makeSession({ continuationPolicy: 'prompt' }), msg, db);

    expect(win.webContents.send).toHaveBeenCalledWith(
      `${IPC.SESSION_CONTINUATION_PROMPT}:sess-1`,
      expect.objectContaining({ voiceResponses: expect.any(Array) }),
    );
  });

  it('auto-continuation: always broadcasts for all rounds up to continuationMaxRounds', async () => {
    const alice = makeVoiceMock('v-alice', 'Alice', 'Just a plain answer');
    const bob = makeVoiceMock('v-bob', 'Bob', 'Another plain answer');
    const sm = new SessionManager(makeVoiceManager([alice, bob]));

    const msg = makeConductorMessage();
    insertMessage(db, msg);

    await sm.runBroadcastRound(
      win as any,
      makeSession({ continuationPolicy: 'auto', continuationMaxRounds: 2 }),
      msg,
      db,
    );

    // continuationMaxRounds: 2 → initial round + 1 continuation = 2 calls each
    expect(alice.send).toHaveBeenCalledTimes(2);
    expect(bob.send).toHaveBeenCalledTimes(2);
  });

  it('auto-continuation: specific @mention → only the mentioned voice responds next', async () => {
    // Bob mentions @Alice specifically in his response
    const alice = makeVoiceMock('v-alice', 'Alice', 'My initial answer');
    const bob = makeVoiceMock('v-bob', 'Bob', '@Alice what do you think?');
    const sm = new SessionManager(makeVoiceManager([alice, bob]));

    const msg = makeConductorMessage();
    insertMessage(db, msg);

    await sm.runBroadcastRound(
      win as any,
      makeSession({ continuationPolicy: 'auto', continuationMaxRounds: 2 }),
      msg,
      db,
    );

    // Alice responds in the initial broadcast AND in the directed continuation
    expect(alice.send).toHaveBeenCalledTimes(2);
    // Bob only responds in the initial broadcast — not called for the continuation
    expect(bob.send).toHaveBeenCalledOnce();
  });

  it('auto-continuation: no @mentions → broadcasts all voices in the continuation round', async () => {
    // Responses reference each other by name but not with @mention syntax
    const alice = makeVoiceMock('v-alice', 'Alice', 'hey Bob, interesting point');
    const bob = makeVoiceMock('v-bob', 'Bob', 'hey Alice, thanks');
    const sm = new SessionManager(makeVoiceManager([alice, bob]));

    const msg = makeConductorMessage();
    insertMessage(db, msg);

    await sm.runBroadcastRound(
      win as any,
      makeSession({ continuationPolicy: 'auto', continuationMaxRounds: 2 }),
      msg,
      db,
    );

    // Both voices respond in the initial round AND the continuation broadcast
    expect(alice.send).toHaveBeenCalledTimes(2);
    expect(bob.send).toHaveBeenCalledTimes(2);
  });

  it('auto-continuation: depth limit prevents runaway rounds', async () => {
    // Both voices always @mention each other — without a depth cap this would loop
    const alice = makeVoiceMock('v-alice', 'Alice', '@Bob your turn');
    const bob = makeVoiceMock('v-bob', 'Bob', '@Alice your turn');
    const sm = new SessionManager(makeVoiceManager([alice, bob]));

    const msg = makeConductorMessage();
    insertMessage(db, msg);

    // continuationMaxRounds: 1 → maxDepth = min(0, 2) = 0, so no continuation at all
    await sm.runBroadcastRound(
      win as any,
      makeSession({ continuationPolicy: 'auto', continuationMaxRounds: 1 }),
      msg,
      db,
    );

    expect(alice.send).toHaveBeenCalledOnce();
    expect(bob.send).toHaveBeenCalledOnce();
  });
});

describe('SessionManager.runDirectedRound', () => {
  let db: Database.Database;
  let win: ReturnType<typeof makeWin>;

  beforeEach(() => {
    db = makeTestDb();
    win = makeWin();
  });

  afterEach(() => {
  });

  it('calls send() only on the targeted voice', async () => {
    const alice = makeVoiceMock('v-alice', 'Alice', 'Alice response');
    const bob = makeVoiceMock('v-bob', 'Bob', 'Bob response');
    const sm = new SessionManager(makeVoiceManager([alice, bob]));

    const msg = makeConductorMessage('@Alice what do you think?');
    insertMessage(db, msg);

    await sm.runDirectedRound(win as any, makeSession({ mode: 'conductor' }), msg, 'v-alice', db);

    expect(alice.send).toHaveBeenCalledOnce();
    expect(bob.send).not.toHaveBeenCalled();
  });

  it('persists the voice response to the DB', async () => {
    const alice = makeVoiceMock('v-alice', 'Alice', 'Alice response');
    const sm = new SessionManager(makeVoiceManager([alice]));

    const msg = makeConductorMessage('@Alice hi');
    insertMessage(db, msg);

    await sm.runDirectedRound(win as any, makeSession({ mode: 'conductor' }), msg, 'v-alice', db);

    const saved = listMessages(db, 'sess-1').filter((m) => m.role === 'voice');
    expect(saved).toHaveLength(1);
    expect(saved[0]!.voiceId).toBe('v-alice');
    expect(saved[0]!.content).toBe('Alice response');
  });

  it('emits VOICE_ERROR and returns early when the target voice is not found', async () => {
    const alice = makeVoiceMock('v-alice', 'Alice', 'Alice response');
    const sm = new SessionManager(makeVoiceManager([alice]));

    const msg = makeConductorMessage('@Ghost hi');
    insertMessage(db, msg);

    await sm.runDirectedRound(win as any, makeSession({ mode: 'conductor' }), msg, 'v-ghost', db);

    expect(alice.send).not.toHaveBeenCalled();
    expect(win.webContents.send).toHaveBeenCalledWith(
      `${IPC.VOICE_ERROR}:sess-1`,
      expect.objectContaining({ voiceId: 'v-ghost' }),
    );
  });

  it('works within a broadcast session (conductor @mentions a specific voice)', async () => {
    const alice = makeVoiceMock('v-alice', 'Alice', 'Alice response');
    const bob = makeVoiceMock('v-bob', 'Bob', 'Bob response');
    const sm = new SessionManager(makeVoiceManager([alice, bob]));

    const msg = makeConductorMessage('@Alice just you');
    insertMessage(db, msg);

    await sm.runDirectedRound(win as any, makeSession({ mode: 'broadcast' }), msg, 'v-alice', db);

    expect(alice.send).toHaveBeenCalledOnce();
    expect(bob.send).not.toHaveBeenCalled();
  });
});
