import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { CREATE_TABLES_SQL } from '../db/schema';
import { initFieldEncryption, _resetForTests } from '../security/fieldEncryption';
import { IPC } from '../../shared/constants';
import { insertComposition } from '../db/queries/compositions';
import { insertSession } from '../db/queries/sessions';
import { insertMessage } from '../db/queries/messages';
import type { Composition, Session, Message } from '../../shared/types';

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
    createVoice: vi.fn().mockReturnValue({ id: 'v-1', name: 'Alice' }),
    getVoice: vi.fn().mockReturnValue(undefined),
    initSession: vi.fn(),
    getEnsemble: vi.fn().mockReturnValue([{ id: 'v-1', name: 'Alice' }]),
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
  const id = overrides.id ?? 'comp-1';
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
    id: 'sess-1',
    compositionId: 'comp-1',
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
    id: 'msg-1',
    sessionId: 'sess-1',
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

      const result = await handlers.get(IPC.SESSION_CREATE)!({}, 'comp-1', 'My Session');

      expect(result).toMatchObject({
        compositionId: 'comp-1',
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
        handlers.get(IPC.SESSION_CREATE)!({}, 'nonexistent', 'My Session'),
      ).rejects.toThrow('Composition not found: nonexistent');
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
      expect(result[0].id).toBe('sess-1');
    });

    it('respects archived flag — false excludes archived sessions', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession({ id: 'active' }));
      insertSession(db, makeSession({ id: 'archived', archived: false }));
      await handlers.get(IPC.SESSION_ARCHIVE)!({}, 'archived', true);

      const active = await handlers.get(IPC.SESSION_LIST)!({}, false);
      expect(active.map((s: Session) => s.id)).not.toContain('archived');
    });

    it('respects archived flag — true returns only archived sessions', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession({ id: 'active' }));
      insertSession(db, makeSession({ id: 'archived', archived: false }));
      await handlers.get(IPC.SESSION_ARCHIVE)!({}, 'archived', true);

      const archived = await handlers.get(IPC.SESSION_LIST)!({}, true);
      expect(archived.map((s: Session) => s.id)).toContain('archived');
      expect(archived.map((s: Session) => s.id)).not.toContain('active');
    });
  });

  describe('SESSION_GET', () => {
    it('returns session by id', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession());

      const result = await handlers.get(IPC.SESSION_GET)!({}, 'sess-1');
      expect(result).toMatchObject({ id: 'sess-1', name: 'Test Session' });
    });

    it('returns null for unknown id', async () => {
      const result = await handlers.get(IPC.SESSION_GET)!({}, 'nope');
      expect(result).toBeNull();
    });
  });

  describe('SESSION_DELETE', () => {
    it('removes session from DB and calls sessionManager.disposeSession', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession());

      await handlers.get(IPC.SESSION_DELETE)!({}, 'sess-1');

      const result = await handlers.get(IPC.SESSION_GET)!({}, 'sess-1');
      expect(result).toBeNull();
      expect(sessionManager.disposeSession).toHaveBeenCalledWith('sess-1');
    });
  });

  describe('SESSION_ARCHIVE', () => {
    it('archives a session (archived=true)', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession());

      await handlers.get(IPC.SESSION_ARCHIVE)!({}, 'sess-1', true);

      const archived = await handlers.get(IPC.SESSION_LIST)!({}, true);
      expect(archived.some((s: Session) => s.id === 'sess-1')).toBe(true);
    });

    it('unarchives a session (archived=false)', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession());
      await handlers.get(IPC.SESSION_ARCHIVE)!({}, 'sess-1', true);

      await handlers.get(IPC.SESSION_ARCHIVE)!({}, 'sess-1', false);

      const active = await handlers.get(IPC.SESSION_LIST)!({}, false);
      expect(active.some((s: Session) => s.id === 'sess-1')).toBe(true);
      const archivedList = await handlers.get(IPC.SESSION_LIST)!({}, true);
      expect(archivedList.some((s: Session) => s.id === 'sess-1')).toBe(false);
    });
  });

  describe('SESSION_MESSAGES_LIST', () => {
    it('returns messages for a session', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession());
      insertMessage(db, makeMessage());
      insertMessage(db, makeMessage({ id: 'msg-2', content: 'World', timestamp: 3000 }));

      const result = await handlers.get(IPC.SESSION_MESSAGES_LIST)!({}, 'sess-1');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('msg-1');
      expect(result[1].id).toBe('msg-2');
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
  });

  describe('COMPOSITION_LIST', () => {
    it('returns compositions', async () => {
      insertComposition(db, makeComposition());

      const result = await handlers.get(IPC.COMPOSITION_LIST)!({});
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('comp-1');
    });
  });

  describe('COMPOSITION_GET', () => {
    it('returns composition by id', async () => {
      insertComposition(db, makeComposition());

      const result = await handlers.get(IPC.COMPOSITION_GET)!({}, 'comp-1');
      expect(result).toMatchObject({ id: 'comp-1', name: 'Test Composition' });
    });

    it('returns null for unknown id', async () => {
      const result = await handlers.get(IPC.COMPOSITION_GET)!({}, 'nope');
      expect(result).toBeNull();
    });
  });

  describe('COMPOSITION_UPDATE', () => {
    it('updates name field', async () => {
      insertComposition(db, makeComposition());

      const result = await handlers.get(IPC.COMPOSITION_UPDATE)!({}, 'comp-1', { name: 'Renamed' });
      expect(result.name).toBe('Renamed');

      const fetched = await handlers.get(IPC.COMPOSITION_GET)!({}, 'comp-1');
      expect(fetched.name).toBe('Renamed');
    });

    it('inserts system message when a voice is added to a composition with existing sessions', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession());

      const updatedVoices = [
        { id: 'cv-1', compositionId: 'comp-1', provider: 'anthropic', model: 'claude-sonnet-4-5', displayName: 'Alice', order: 0, color: '#D4763B', avatarIcon: 'bot' },
        { id: 'cv-new', compositionId: 'comp-1', provider: 'openai', model: 'gpt-4o', displayName: 'Bob', order: 1, color: '#10A37F', avatarIcon: 'bot' },
      ];

      await handlers.get(IPC.COMPOSITION_UPDATE)!({}, 'comp-1', { voices: updatedVoices });

      const messages = await handlers.get(IPC.SESSION_MESSAGES_LIST)!({}, 'sess-1');
      expect(messages.some((m: Message) => m.content.includes('Bob') && m.content.includes('added'))).toBe(true);
      expect(voiceManager.disposeSession).toHaveBeenCalledWith('sess-1');
    });

    it('inserts system message when a voice is removed from a composition with existing sessions', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession());

      // Replace cv-1 (Alice) with a different voice (cv-new / Bob) so Alice appears in removed
      const replacementVoices = [
        { id: 'cv-new', compositionId: 'comp-1', provider: 'openai', model: 'gpt-4o', displayName: 'Bob', order: 0, color: '#10A37F', avatarIcon: 'bot' },
      ];

      await handlers.get(IPC.COMPOSITION_UPDATE)!({}, 'comp-1', { voices: replacementVoices });

      const messages = await handlers.get(IPC.SESSION_MESSAGES_LIST)!({}, 'sess-1');
      expect(messages.some((m: Message) => m.content.includes('Alice') && m.content.includes('removed'))).toBe(true);
      expect(voiceManager.disposeSession).toHaveBeenCalledWith('sess-1');
    });
  });

  describe('COMPOSITION_DELETE', () => {
    it('removes composition', async () => {
      insertComposition(db, makeComposition());

      await handlers.get(IPC.COMPOSITION_DELETE)!({}, 'comp-1');

      const result = await handlers.get(IPC.COMPOSITION_GET)!({}, 'comp-1');
      expect(result).toBeNull();
    });
  });

  describe('COMPOSITION_ARCHIVE', () => {
    it('archives a composition', async () => {
      insertComposition(db, makeComposition());

      await handlers.get(IPC.COMPOSITION_ARCHIVE)!({}, 'comp-1', true);

      const active = await handlers.get(IPC.COMPOSITION_LIST)!({}, false);
      expect(active.some((c: Composition) => c.id === 'comp-1')).toBe(false);

      const archived = await handlers.get(IPC.COMPOSITION_LIST)!({}, true);
      expect(archived.some((c: Composition) => c.id === 'comp-1')).toBe(true);
    });
  });

  // --- VOICE handlers ---

  describe('VOICE_SEND', () => {
    it('throws when session not found', async () => {
      await expect(
        handlers.get(IPC.VOICE_SEND)!({ sender: {} }, 'nonexistent', makeMessage()),
      ).rejects.toThrow('Session not found: nonexistent');
    });

    it('calls runBroadcastRound for a broadcast session', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession({ mode: 'broadcast' }));

      await handlers.get(IPC.VOICE_SEND)!({ sender: {} }, 'sess-1', makeMessage());

      expect(sessionManager.runBroadcastRound).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'sess-1', mode: 'broadcast' }),
        expect.objectContaining({ id: 'msg-1' }),
        db,
      );
    });

    it('calls runDirectedRound when a valid @mention is found in broadcast session', async () => {
      insertComposition(db, makeComposition());
      insertSession(db, makeSession({ mode: 'broadcast' }));
      sessionManager.parseMention.mockReturnValue('Alice');

      await handlers.get(IPC.VOICE_SEND)!(
        { sender: {} },
        'sess-1',
        makeMessage({ content: '@Alice hello' }),
      );

      expect(sessionManager.runDirectedRound).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'sess-1' }),
        expect.objectContaining({ content: '@Alice hello' }),
        'v-1',
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
        'sess-1',
        makeMessage({ content: '@Alice hello' }),
      );

      expect(sessionManager.runDirectedRound).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'sess-1' }),
        expect.objectContaining({ content: '@Alice hello' }),
        'v-1',
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

      await handlers.get(IPC.VOICE_SEND)!({ sender: {} }, 'sess-1', makeMessage());

      expect(sessionManager.runBroadcastRound).not.toHaveBeenCalled();
      expect(sessionManager.runDirectedRound).not.toHaveBeenCalled();
      expect(mockWin.webContents.send).toHaveBeenCalledWith(
        `${IPC.SESSION_NO_TARGET}:sess-1`,
        expect.objectContaining({ voiceNames: expect.any(Array) }),
      );
    });
  });

  describe('VOICE_ABORT', () => {
    it('calls voiceManager.disposeSession', async () => {
      await handlers.get(IPC.VOICE_ABORT)!({}, 'sess-1');
      expect(voiceManager.disposeSession).toHaveBeenCalledWith('sess-1');
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
  });
});
