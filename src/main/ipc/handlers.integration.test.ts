import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { CREATE_TABLES_SQL } from '../db/schema';
import { initFieldEncryption, _resetForTests } from '../security/fieldEncryption';
import { IPC } from '../../shared/constants';
import { insertComposition } from '../db/queries/compositions';
import { insertSession } from '../db/queries/sessions';
import { insertMessage } from '../db/queries/messages';
import type { Composition, Session, Message } from '../../shared/types';

// UUID fixture constants
const COMP_ID   = '00000000-0000-0000-0000-000000000001';
const SESS_ID   = '00000000-0000-0000-0000-000000000002';
const VOICE_ID  = '00000000-0000-0000-0000-000000000003';
const MSG_ID    = '00000000-0000-0000-0000-000000000004';
const CP_ID     = '00000000-0000-0000-0000-000000000005';
const MSG_ID_2  = '00000000-0000-0000-0000-000000000006';
const SESS_ID_ACTIVE   = '00000000-0000-0000-0000-000000000010';
const SESS_ID_ARCHIVED = '00000000-0000-0000-0000-000000000011';
const UNKNOWN_ID = '00000000-0000-0000-0000-000000000099';

const handlers = new Map<string, Function>();

const mockShellOpenExternal = vi.fn().mockResolvedValue(undefined);

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: Function) => { handlers.set(channel, fn); },
  },
  BrowserWindow: {
    fromWebContents: vi.fn().mockReturnValue({ webContents: { send: vi.fn() } }),
  },
  shell: {
    openExternal: mockShellOpenExternal,
  },
}));

vi.mock('./settingsHandlers', () => ({ registerSettingsHandlers: vi.fn() }));

const mockGetCachedUpdateInfo = vi.fn().mockReturnValue(null);
const mockCheckForUpdateNow = vi.fn().mockResolvedValue(null);
vi.mock('../utils/updateChecker', () => ({
  getCachedUpdateInfo: () => mockGetCachedUpdateInfo(),
  checkForUpdateNow: (...args: unknown[]) => mockCheckForUpdateNow(...args),
}));

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(CREATE_TABLES_SQL);
  // Seed a user_profile row (required for update preference queries)
  db.prepare(
    'INSERT OR IGNORE INTO user_profile (id, conductor_name, pronouns, conductor_context, default_tone, conductor_color, conductor_avatar, updated_at) VALUES (1, \'\', \'\', \'\', \'collaborative\', \'\', \'\', 0)',
  ).run();
  return db;
}

function makeMockVoiceManager() {
  return {
    createVoice: vi.fn().mockReturnValue({ id: VOICE_ID, name: 'Alice' }),
    getVoice: vi.fn().mockReturnValue(undefined),
    initSession: vi.fn(),
    getEnsemble: vi.fn().mockReturnValue([{ id: VOICE_ID, name: 'Alice' }]),
    buildEnsembleSystemPrompt: vi.fn().mockReturnValue(''),
    disposeSession: vi.fn(),
  } as any;
}

function makeMockSessionManager() {
  return {
    runBroadcastRound: vi.fn().mockResolvedValue(undefined),
    runDirectedRound: vi.fn().mockResolvedValue(undefined),
    parseMention: vi.fn().mockReturnValue(null),
    disposeSession: vi.fn(),
  } as any;
}

function makeComposition(overrides: Partial<Composition> = {}): Composition {
  const id = overrides.id ?? COMP_ID;
  return {
    id,
    name: 'Test Composition',
    mode: 'broadcast',
    continuationPolicy: 'none',
    continuationMaxRounds: 1,
    voices: [
      {
        id: 'cv-1',
        compositionId: id,
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        displayName: 'Alice',
        order: 0,
        color: '#D4763B',
        avatarIcon: 'bot',
      },
    ],
    createdAt: 1000,
    updatedAt: 1000,
    archived: false,
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: SESS_ID,
    compositionId: COMP_ID,
    name: 'Test Session',
    mode: 'broadcast',
    continuationPolicy: 'none',
    continuationMaxRounds: 1,
    createdAt: 1000,
    updatedAt: 1000,
    archived: false,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: MSG_ID,
    sessionId: SESS_ID,
    role: 'conductor',
    voiceId: null,
    voiceName: null,
    content: 'Hello',
    timestamp: 2000,
    roundIndex: 0,
    ...overrides,
  };
}

describe('IPC handlers integration', () => {
  let db: DatabaseSync;
  let voiceManager: ReturnType<typeof makeMockVoiceManager>;
  let sessionManager: ReturnType<typeof makeMockSessionManager>;

  beforeEach(async () => {
    initFieldEncryption(Buffer.alloc(32));
    handlers.clear();
    mockShellOpenExternal.mockClear();
    mockGetCachedUpdateInfo.mockClear().mockReturnValue(null);
    mockCheckForUpdateNow.mockClear().mockResolvedValue(null);
    db = createTestDb();
    voiceManager = makeMockVoiceManager();
    sessionManager = makeMockSessionManager();
    const { registerIpcHandlers } = await import('./index');
    registerIpcHandlers(db, voiceManager, sessionManager);
  });

  afterEach(() => { db.close(); _resetForTests(); });

  // --- SESSION handlers ---

  describe('SESSION_CREATE', () => {
    it('creates a session, inserts into DB, returns session with correct fields, calls voiceManager.initSession', async () => {
      insertComposition(db, makeComposition());

      const result = await handlers.get(IPC.SESSION_CREATE)!({}, COMP_ID, 'My Session');

      expect(result).toMatchObject({
        compositionId: COMP_ID,
        name: 'My Session',
        mode: 'broadcast',
        continuationPolicy: 'none',
        continuationMaxRounds: 1,
        archived: false,
      });
      expect(typeof result.id).toBe('string');
      expect(result.id.length).toBeGreaterThan(0);
      expect(voiceManager.initSession).toHaveBeenCalledWith(result.id, expect.any(Array), 'broadcast', expect.any(Object));
    });

    it('throws when composition not found', async () => {
      await expect(
        handlers.get(IPC.SESSION_CREATE)!({}, UNKNOWN_ID, 'My Session'),
      ).rejects.toThrow('Composition not found');
    });

    it('throws for non-UUID compositionId', async () => {
      await expect(
        handlers.get(IPC.SESSION_CREATE)!({}, 'not-a-uuid', 'My Session'),
      ).rejects.toThrow('Invalid compositionId: must be a valid UUID');
    });

    it('throws when name exceeds 200 characters', async () => {
      insertComposition(db, makeComposition());
      await expect(
        handlers.get(IPC.SESSION_CREATE)!({}, COMP_ID, 'a'.repeat(201)),
      ).rejects.toThrow('name exceeds maximum length of 200');
    });
  });

  describe('SESSION_LIST', () => {
    it('returns empty array when no sessions', async () => {
      const result = await handlers.get(IPC.SESSION_LIST)!({});
      expect(result).toEqual([]);
    });

    it('returns active sessions with default archived=false', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession());

      const result = await handlers.get(IPC.SESSION_LIST)!({});
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(SESS_ID);
    });

    it('respects archived flag — false excludes archived sessions', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession({ id: SESS_ID_ACTIVE }));
      insertSession(db, makeSession({ id: SESS_ID_ARCHIVED, archived: false }));
      await handlers.get(IPC.SESSION_ARCHIVE)!({}, SESS_ID_ARCHIVED, true);

      const active = await handlers.get(IPC.SESSION_LIST)!({}, false);
      expect(active.map((s: Session) => s.id)).not.toContain(SESS_ID_ARCHIVED);
    });

    it('respects archived flag — true returns only archived sessions', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession({ id: SESS_ID_ACTIVE }));
      insertSession(db, makeSession({ id: SESS_ID_ARCHIVED, archived: false }));
      await handlers.get(IPC.SESSION_ARCHIVE)!({}, SESS_ID_ARCHIVED, true);

      const archived = await handlers.get(IPC.SESSION_LIST)!({}, true);
      expect(archived.map((s: Session) => s.id)).toContain(SESS_ID_ARCHIVED);
      expect(archived.map((s: Session) => s.id)).not.toContain(SESS_ID_ACTIVE);
    });
  });

  describe('SESSION_GET', () => {
    it('returns session by id', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession());

      const result = await handlers.get(IPC.SESSION_GET)!({}, SESS_ID);
      expect(result).toMatchObject({ id: SESS_ID, name: 'Test Session' });
    });

    it('returns null for unknown id', async () => {
      const result = await handlers.get(IPC.SESSION_GET)!({}, UNKNOWN_ID);
      expect(result).toBeNull();
    });

    it('throws for non-UUID id', async () => {
      await expect(handlers.get(IPC.SESSION_GET)!({}, 'not-a-uuid')).rejects.toThrow(
        'Invalid id: must be a valid UUID',
      );
    });
  });

  describe('SESSION_DELETE', () => {
    it('removes session from DB and calls sessionManager.disposeSession', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession());

      await handlers.get(IPC.SESSION_DELETE)!({}, SESS_ID);

      const result = await handlers.get(IPC.SESSION_GET)!({}, SESS_ID);
      expect(result).toBeNull();
      expect(sessionManager.disposeSession).toHaveBeenCalledWith(SESS_ID);
    });

    it('throws for non-UUID id', async () => {
      await expect(handlers.get(IPC.SESSION_DELETE)!({}, 'bad-id')).rejects.toThrow(
        'Invalid id: must be a valid UUID',
      );
    });
  });

  describe('SESSION_ARCHIVE', () => {
    it('archives a session (archived=true)', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession());

      await handlers.get(IPC.SESSION_ARCHIVE)!({}, SESS_ID, true);

      const archived = await handlers.get(IPC.SESSION_LIST)!({}, true);
      expect(archived.some((s: Session) => s.id === SESS_ID)).toBe(true);
    });

    it('unarchives a session (archived=false)', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession());
      await handlers.get(IPC.SESSION_ARCHIVE)!({}, SESS_ID, true);

      await handlers.get(IPC.SESSION_ARCHIVE)!({}, SESS_ID, false);

      const active = await handlers.get(IPC.SESSION_LIST)!({}, false);
      expect(active.some((s: Session) => s.id === SESS_ID)).toBe(true);
      const archivedList = await handlers.get(IPC.SESSION_LIST)!({}, true);
      expect(archivedList.some((s: Session) => s.id === SESS_ID)).toBe(false);
    });

    it('throws for non-UUID id', async () => {
      await expect(handlers.get(IPC.SESSION_ARCHIVE)!({}, 'bad-id', true)).rejects.toThrow(
        'Invalid id: must be a valid UUID',
      );
    });

    it('coerces archived=1 to true', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession());

      await handlers.get(IPC.SESSION_ARCHIVE)!({}, SESS_ID, 1 as unknown as boolean);

      const archived = await handlers.get(IPC.SESSION_LIST)!({}, true);
      expect(archived.some((s: Session) => s.id === SESS_ID)).toBe(true);
    });
  });

  describe('SESSION_MESSAGES_LIST', () => {
    it('returns messages for a session', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession());
      insertMessage(db, makeMessage());
      insertMessage(db, makeMessage({ id: MSG_ID_2, content: 'World', timestamp: 3000 }));

      const result = await handlers.get(IPC.SESSION_MESSAGES_LIST)!({}, SESS_ID);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(MSG_ID);
      expect(result[1].id).toBe(MSG_ID_2);
    });
  });

  // --- COMPOSITION handlers ---

  describe('COMPOSITION_CREATE', () => {
    it('creates composition with auto-assigned id and voices get compositionId set', async () => {
      const data = {
        name: 'New Comp',
        mode: 'broadcast',
        continuationPolicy: 'none',
        continuationMaxRounds: 1,
        voices: [
          { id: 'cv-new', provider: 'openai', model: 'gpt-4o', displayName: 'Bob', order: 0, color: '#10A37F', avatarIcon: 'bot' },
        ],
      };

      const result = await handlers.get(IPC.COMPOSITION_CREATE)!({}, data);

      expect(typeof result.id).toBe('string');
      expect(result.id.length).toBeGreaterThan(0);
      expect(result.name).toBe('New Comp');
      expect(result.voices).toHaveLength(1);
      expect(result.voices[0].compositionId).toBe(result.id);
      expect(result.archived).toBe(false);
    });

    it('throws for invalid mode', async () => {
      const data = {
        name: 'New Comp',
        mode: 'roundrobin',
        continuationPolicy: 'none',
        continuationMaxRounds: 1,
        voices: [],
      };
      await expect(handlers.get(IPC.COMPOSITION_CREATE)!({}, data)).rejects.toThrow(
        'Invalid mode: must be one of: conductor, broadcast',
      );
    });

    it('throws for invalid continuationPolicy', async () => {
      const data = {
        name: 'New Comp',
        mode: 'broadcast',
        continuationPolicy: 'always',
        continuationMaxRounds: 1,
        voices: [],
      };
      await expect(handlers.get(IPC.COMPOSITION_CREATE)!({}, data)).rejects.toThrow(
        'Invalid continuationPolicy',
      );
    });

    it('throws for continuationMaxRounds = 11', async () => {
      const data = {
        name: 'New Comp',
        mode: 'broadcast',
        continuationPolicy: 'none',
        continuationMaxRounds: 11,
        voices: [],
      };
      await expect(handlers.get(IPC.COMPOSITION_CREATE)!({}, data)).rejects.toThrow(
        'must be an integer between 1 and 10',
      );
    });
  });

  describe('COMPOSITION_LIST', () => {
    it('returns compositions', async () => {
      insertComposition(db, makeComposition());

      const result = await handlers.get(IPC.COMPOSITION_LIST)!({});
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(COMP_ID);
    });
  });

  describe('COMPOSITION_GET', () => {
    it('returns composition by id', async () => {
      insertComposition(db, makeComposition());

      const result = await handlers.get(IPC.COMPOSITION_GET)!({}, COMP_ID);
      expect(result).toMatchObject({ id: COMP_ID, name: 'Test Composition' });
    });

    it('returns null for unknown id', async () => {
      const result = await handlers.get(IPC.COMPOSITION_GET)!({}, UNKNOWN_ID);
      expect(result).toBeNull();
    });
  });

  describe('COMPOSITION_UPDATE', () => {
    it('updates name field', async () => {
      insertComposition(db, makeComposition());

      const result = await handlers.get(IPC.COMPOSITION_UPDATE)!({}, COMP_ID, { name: 'Renamed' });
      expect(result.name).toBe('Renamed');

      const fetched = await handlers.get(IPC.COMPOSITION_GET)!({}, COMP_ID);
      expect(fetched.name).toBe('Renamed');
    });

    it('throws for non-UUID id', async () => {
      await expect(
        handlers.get(IPC.COMPOSITION_UPDATE)!({}, 'bad-id', { name: 'X' }),
      ).rejects.toThrow('Invalid id: must be a valid UUID');
    });

    it('throws for invalid mode if provided', async () => {
      insertComposition(db, makeComposition());
      await expect(
        handlers.get(IPC.COMPOSITION_UPDATE)!({}, COMP_ID, { mode: 'roundrobin' }),
      ).rejects.toThrow('Invalid mode: must be one of: conductor, broadcast');
    });

    it('inserts system message when a voice is added to a composition with existing sessions', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession());

      const updatedVoices = [
        { id: 'cv-1', compositionId: COMP_ID, provider: 'anthropic', model: 'claude-sonnet-4-5', displayName: 'Alice', order: 0, color: '#D4763B', avatarIcon: 'bot' },
        { id: 'cv-new', compositionId: COMP_ID, provider: 'openai', model: 'gpt-4o', displayName: 'Bob', order: 1, color: '#10A37F', avatarIcon: 'bot' },
      ];

      await handlers.get(IPC.COMPOSITION_UPDATE)!({}, COMP_ID, { voices: updatedVoices });

      const messages = await handlers.get(IPC.SESSION_MESSAGES_LIST)!({}, SESS_ID);
      expect(messages.some((m: Message) => m.content.includes('Bob') && m.content.includes('added'))).toBe(true);
      expect(voiceManager.disposeSession).toHaveBeenCalledWith(SESS_ID);
    });

    it('inserts system message when a voice is removed from a composition with existing sessions', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession());

      // Replace cv-1 (Alice) with a different voice (cv-new / Bob) so Alice appears in removed
      const replacementVoices = [
        { id: 'cv-new', compositionId: COMP_ID, provider: 'openai', model: 'gpt-4o', displayName: 'Bob', order: 0, color: '#10A37F', avatarIcon: 'bot' },
      ];

      await handlers.get(IPC.COMPOSITION_UPDATE)!({}, COMP_ID, { voices: replacementVoices });

      const messages = await handlers.get(IPC.SESSION_MESSAGES_LIST)!({}, SESS_ID);
      expect(messages.some((m: Message) => m.content.includes('Alice') && m.content.includes('removed'))).toBe(true);
      expect(voiceManager.disposeSession).toHaveBeenCalledWith(SESS_ID);
    });
  });

  describe('COMPOSITION_DELETE', () => {
    it('removes composition', async () => {
      insertComposition(db, makeComposition());

      await handlers.get(IPC.COMPOSITION_DELETE)!({}, COMP_ID);

      const result = await handlers.get(IPC.COMPOSITION_GET)!({}, COMP_ID);
      expect(result).toBeNull();
    });

    it('throws for non-UUID id', async () => {
      await expect(handlers.get(IPC.COMPOSITION_DELETE)!({}, 'bad-id')).rejects.toThrow(
        'Invalid id: must be a valid UUID',
      );
    });
  });

  describe('COMPOSITION_ARCHIVE', () => {
    it('archives a composition', async () => {
      insertComposition(db, makeComposition());

      await handlers.get(IPC.COMPOSITION_ARCHIVE)!({}, COMP_ID, true);

      const active = await handlers.get(IPC.COMPOSITION_LIST)!({}, false);
      expect(active.some((c: Composition) => c.id === COMP_ID)).toBe(false);

      const archived = await handlers.get(IPC.COMPOSITION_LIST)!({}, true);
      expect(archived.some((c: Composition) => c.id === COMP_ID)).toBe(true);
    });
  });

  // --- VOICE handlers ---

  describe('VOICE_SEND', () => {
    it('throws when session not found', async () => {
      await expect(
        handlers.get(IPC.VOICE_SEND)!({ sender: {} }, UNKNOWN_ID, makeMessage()),
      ).rejects.toThrow('Session not found');
    });

    it('throws for non-UUID sessionId', async () => {
      await expect(
        handlers.get(IPC.VOICE_SEND)!({ sender: {} }, 'not-a-uuid', makeMessage()),
      ).rejects.toThrow('Invalid sessionId: must be a valid UUID');
    });

    it('accepts empty message.content (continuation messages)', async () => {
      const emptyContentMsg = { ...makeMessage(), content: '' };
      // Validation passes; throws later because session does not exist in this test
      await expect(
        handlers.get(IPC.VOICE_SEND)!({ sender: {} }, SESS_ID, emptyContentMsg),
      ).rejects.toThrow('Session not found');
    });

    it('throws for invalid message.role', async () => {
      const badMessage = { ...makeMessage(), role: 'admin' };
      await expect(
        handlers.get(IPC.VOICE_SEND)!({ sender: {} }, SESS_ID, badMessage),
      ).rejects.toThrow('Invalid message.role');
    });

    it('calls runBroadcastRound for a broadcast session', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession({ mode: 'broadcast' }));

      await handlers.get(IPC.VOICE_SEND)!({ sender: {} }, SESS_ID, makeMessage());

      expect(sessionManager.runBroadcastRound).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: SESS_ID, mode: 'broadcast' }),
        expect.objectContaining({ id: MSG_ID }),
        db,
      );
    });

    it('calls runDirectedRound when a valid @mention is found in broadcast session', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession({ mode: 'broadcast' }));
      sessionManager.parseMention.mockReturnValue('Alice');

      await handlers.get(IPC.VOICE_SEND)!(
        { sender: {} },
        SESS_ID,
        makeMessage({ content: '@Alice hello' }),
      );

      expect(sessionManager.runDirectedRound).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: SESS_ID }),
        expect.objectContaining({ content: '@Alice hello' }),
        VOICE_ID,
        db,
      );
      expect(sessionManager.runBroadcastRound).not.toHaveBeenCalled();
    });

    it('calls runDirectedRound when a valid @mention is found in conductor session', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession({ mode: 'conductor' }));
      sessionManager.parseMention.mockReturnValue('Alice');

      await handlers.get(IPC.VOICE_SEND)!(
        { sender: {} },
        SESS_ID,
        makeMessage({ content: '@Alice hello' }),
      );

      expect(sessionManager.runDirectedRound).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: SESS_ID }),
        expect.objectContaining({ content: '@Alice hello' }),
        VOICE_ID,
        db,
      );
    });

    it('sends SESSION_NO_TARGET and does not broadcast in conductor session when no @mention', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession({ mode: 'conductor' }));
      sessionManager.parseMention.mockReturnValue(null);

      const mockWin = { webContents: { send: vi.fn() } };
      const { BrowserWindow } = await import('electron');
      vi.mocked(BrowserWindow.fromWebContents).mockReturnValueOnce(mockWin as any);

      await handlers.get(IPC.VOICE_SEND)!({ sender: {} }, SESS_ID, makeMessage());

      expect(sessionManager.runBroadcastRound).not.toHaveBeenCalled();
      expect(sessionManager.runDirectedRound).not.toHaveBeenCalled();
      expect(mockWin.webContents.send).toHaveBeenCalledWith(
        `${IPC.SESSION_NO_TARGET}:${SESS_ID}`,
        expect.objectContaining({ voiceNames: expect.any(Array) }),
      );
    });
  });

  describe('VOICE_ABORT', () => {
    it('calls voiceManager.disposeSession', async () => {
      await handlers.get(IPC.VOICE_ABORT)!({}, SESS_ID);
      expect(voiceManager.disposeSession).toHaveBeenCalledWith(SESS_ID);
    });
  });

  // --- Encryption at the IPC layer ---

  describe('Encryption at the IPC layer', () => {
    const SENTINEL = 'SENTINEL_PLAINTEXT_MUST_NOT_APPEAR';

    it('COMPOSITION_CREATE stores composition_voices encrypted fields as ciphertext', async () => {
      const data = {
        name: 'Encrypted Comp',
        mode: 'broadcast',
        continuationPolicy: 'none',
        continuationMaxRounds: 1,
        voices: [
          {
            id: 'cv-enc',
            provider: 'anthropic',
            model: 'claude-opus-4-6',
            displayName: 'Alice',
            systemPrompt: SENTINEL,
            cliCommand: SENTINEL,
            cliArgs: [SENTINEL],
            order: 0,
            color: '#000',
            avatarIcon: 'star',
          },
        ],
      };

      const result = await handlers.get(IPC.COMPOSITION_CREATE)!({}, data);
      const row = db
        .prepare('SELECT system_prompt, cli_command, cli_args FROM composition_voices WHERE composition_id = ?')
        .get(result.id) as { system_prompt: string; cli_command: string; cli_args: string };

      expect(row.system_prompt).toMatch(/^ENC:v1:/);
      expect(row.system_prompt).not.toContain(SENTINEL);
      expect(row.cli_command).toMatch(/^ENC:v1:/);
      expect(row.cli_command).not.toContain(SENTINEL);
      expect(row.cli_args).toMatch(/^ENC:v1:/);
      expect(row.cli_args).not.toContain(SENTINEL);
    });

    it('VOICE_SEND stores messages.content as ciphertext', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession());

      await handlers.get(IPC.VOICE_SEND)!({ sender: {} }, SESS_ID, makeMessage({ content: SENTINEL }));

      const row = db
        .prepare('SELECT content FROM messages WHERE id = ?')
        .get(MSG_ID) as { content: string };

      expect(row.content).toMatch(/^ENC:v1:/);
      expect(row.content).not.toContain(SENTINEL);
    });
  });

  // --- SHELL handlers ---

  describe('SHELL_OPEN_EXTERNAL', () => {
    it('calls shell.openExternal for valid https://polyphon.ai URL', async () => {
      const url = 'https://polyphon.ai/#download';
      await handlers.get(IPC.SHELL_OPEN_EXTERNAL)!({}, url);
      expect(mockShellOpenExternal).toHaveBeenCalledWith(url);
    });

    it('calls shell.openExternal for valid https://polyphon.ai path URL', async () => {
      const url = 'https://polyphon.ai/releases/latest';
      await handlers.get(IPC.SHELL_OPEN_EXTERNAL)!({}, url);
      expect(mockShellOpenExternal).toHaveBeenCalledWith(url);
    });

    it('blocks subdomain bypass attempt (https://polyphon.ai.evil.com)', async () => {
      const url = 'https://polyphon.ai.evil.com/malicious';
      await handlers.get(IPC.SHELL_OPEN_EXTERNAL)!({}, url);
      expect(mockShellOpenExternal).not.toHaveBeenCalled();
    });

    it('blocks non-https URL', async () => {
      const url = 'http://polyphon.ai/#download';
      await handlers.get(IPC.SHELL_OPEN_EXTERNAL)!({}, url);
      expect(mockShellOpenExternal).not.toHaveBeenCalled();
    });

    it('blocks non-polyphon.ai domain', async () => {
      const url = 'https://evil.com/payload';
      await handlers.get(IPC.SHELL_OPEN_EXTERNAL)!({}, url);
      expect(mockShellOpenExternal).not.toHaveBeenCalled();
    });

    it('blocks invalid URL string', async () => {
      await handlers.get(IPC.SHELL_OPEN_EXTERNAL)!({}, 'not-a-url');
      expect(mockShellOpenExternal).not.toHaveBeenCalled();
    });
  });

  // --- UPDATE handlers ---

  describe('UPDATE_GET_STATE', () => {
    it('returns null when no cached update', async () => {
      mockGetCachedUpdateInfo.mockReturnValue(null);
      const result = await handlers.get(IPC.UPDATE_GET_STATE)!({});
      expect(result).toBeNull();
    });

    it('returns cached UpdateInfo when available', async () => {
      mockGetCachedUpdateInfo.mockReturnValue({ version: '1.2.3' });
      const result = await handlers.get(IPC.UPDATE_GET_STATE)!({});
      expect(result).toEqual({ version: '1.2.3' });
    });
  });

  describe('UPDATE_DISMISS', () => {
    it('permanently=true writes dismissed_update_version to DB', async () => {
      await handlers.get(IPC.UPDATE_DISMISS)!({}, '1.2.3', true);
      const row = db
        .prepare('SELECT dismissed_update_version FROM user_profile WHERE id = 1')
        .get() as { dismissed_update_version: string };
      expect(row.dismissed_update_version).toBe('1.2.3');
    });

    it('permanently=false writes update_remind_after ~24h from now', async () => {
      const fakeNow = 1_000_000;
      await handlers.get(IPC.UPDATE_DISMISS)!({}, '1.2.3', false, fakeNow);
      const row = db
        .prepare('SELECT update_remind_after FROM user_profile WHERE id = 1')
        .get() as { update_remind_after: number };
      expect(row.update_remind_after).toBe(fakeNow + 24 * 60 * 60 * 1000);
    });

    it('UPDATE_CHECK_NOW delegates to checkForUpdateNow and returns its result', async () => {
      mockCheckForUpdateNow.mockResolvedValue({ version: '9.9.9' });
      const result = await handlers.get(IPC.UPDATE_CHECK_NOW)!({ sender: {} });
      expect(mockCheckForUpdateNow).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ version: '9.9.9' });
    });

    it('ignores invalid version strings', async () => {
      await handlers.get(IPC.UPDATE_DISMISS)!({}, 'not-a-version', true);
      const row = db
        .prepare('SELECT dismissed_update_version FROM user_profile WHERE id = 1')
        .get() as { dismissed_update_version: string };
      expect(row.dismissed_update_version).toBe('');
    });

    it('rejects version with pre-release suffix', async () => {
      await handlers.get(IPC.UPDATE_DISMISS)!({}, '1.2.3-beta', true);
      const row = db
        .prepare('SELECT dismissed_update_version FROM user_profile WHERE id = 1')
        .get() as { dismissed_update_version: string };
      expect(row.dismissed_update_version).toBe('');
    });

    it('rejects version with extra dot segment', async () => {
      await handlers.get(IPC.UPDATE_DISMISS)!({}, '1.2.3.4', true);
      const row = db
        .prepare('SELECT dismissed_update_version FROM user_profile WHERE id = 1')
        .get() as { dismissed_update_version: string };
      expect(row.dismissed_update_version).toBe('');
    });

    it('still accepts valid exact semver', async () => {
      await handlers.get(IPC.UPDATE_DISMISS)!({}, '1.2.3', true);
      const row = db
        .prepare('SELECT dismissed_update_version FROM user_profile WHERE id = 1')
        .get() as { dismissed_update_version: string };
      expect(row.dismissed_update_version).toBe('1.2.3');
    });
  });
});
