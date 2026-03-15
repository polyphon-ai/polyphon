import { ipcMain, BrowserWindow, shell } from 'electron';
import { URL } from 'url';
import type { DatabaseSync } from 'node:sqlite';
import type { Message, Composition, ExpiryStatus } from '../../shared/types';
import { IPC } from '../../shared/constants';
import { registerSettingsHandlers } from './settingsHandlers';
import type { VoiceManager } from '../managers/VoiceManager';
import type { SessionManager } from '../managers/SessionManager';
import {
  listSessions,
  getSession,
  insertSession,
  deleteSession,
  renameSession,
  archiveSession,
  listSessionsByCompositionId,
} from '../db/queries/sessions';
import {
  listMessages,
  insertMessage,
} from '../db/queries/messages';
import {
  listCompositions,
  getComposition,
  insertComposition,
  updateComposition,
  deleteComposition,
  archiveComposition,
  upsertCompositionVoices,
} from '../db/queries/compositions';
import { generateId } from '../utils';
import { getUserProfile } from '../db/queries/userProfile';

export function registerIpcHandlers(
  db: DatabaseSync,
  voiceManager: VoiceManager,
  sessionManager: SessionManager,
  expiryStatus: ExpiryStatus,
): void {
  // --- Session handlers ---

  ipcMain.handle(IPC.SESSION_CREATE, async (_event, compositionId: string, name: string) => {
    const composition = getComposition(db, compositionId);
    if (!composition) throw new Error(`Composition not found: ${compositionId}`);

    const voices = composition.voices.map((cv) => voiceManager.createVoice(cv));
    const now = Date.now();
    const session = {
      id: generateId(),
      compositionId,
      name,
      mode: composition.mode,
      continuationPolicy: composition.continuationPolicy,
      continuationMaxRounds: composition.continuationMaxRounds,
      createdAt: now,
      updatedAt: now,
      archived: false,
    };

    const profile = getUserProfile(db);
    voiceManager.initSession(session.id, voices, session.mode, profile);
    insertSession(db, session);
    return session;
  });

  ipcMain.handle(IPC.SESSION_LIST, (_event, archived = false) => listSessions(db, archived));

  ipcMain.handle(IPC.SESSION_GET, (_event, id: string) => getSession(db, id));

  ipcMain.handle(IPC.SESSION_MESSAGES_LIST, (_event, sessionId: string) =>
    listMessages(db, sessionId),
  );

  ipcMain.handle(IPC.SESSION_RENAME, (_event, id: string, name: string) =>
    renameSession(db, id, name),
  );

  ipcMain.handle(IPC.SESSION_DELETE, (_event, id: string) => {
    sessionManager.disposeSession(id);
    deleteSession(db, id);
  });

  ipcMain.handle(IPC.SESSION_ARCHIVE, (_event, id: string, archived: boolean) => {
    archiveSession(db, id, archived);
  });

  // --- Voice handlers ---

  ipcMain.handle(IPC.VOICE_SEND, async (event, sessionId: string, message: Message) => {
    const session = getSession(db, sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    insertMessage(db, message);

    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    // Re-initialize from the DB composition if the in-memory session was lost
    // (e.g. after an app restart when the user resumes an existing session).
    let ensemble = voiceManager.getEnsemble(sessionId);
    if (ensemble.length === 0) {
      const composition = getComposition(db, session.compositionId);
      if (composition && composition.voices.length > 0) {
        const voices = composition.voices.map((cv) => voiceManager.createVoice(cv));
        const profile = getUserProfile(db);
        voiceManager.initSession(sessionId, voices, session.mode, profile);
        ensemble = voiceManager.getEnsemble(sessionId);
      }
    }

    const voiceNames = ensemble.map((v) => v.name);
    const mentionedName = sessionManager.parseMention(message.content, voiceNames);
    const targetVoice = mentionedName ? ensemble.find((v) => v.name === mentionedName) : null;

    if (session.mode === 'broadcast') {
      if (targetVoice) {
        // Conductor directed a specific voice within a broadcast session
        await sessionManager.runDirectedRound(win, session, message, targetVoice.id, db);
      } else {
        await sessionManager.runBroadcastRound(win, session, message, db);
      }
    } else {
      if (targetVoice) {
        await sessionManager.runDirectedRound(win, session, message, targetVoice.id, db);
      } else {
        // Directed mode with no @mention — notify the renderer so the UI can
        // prompt the conductor to address a specific voice.
        win.webContents.send(`${IPC.SESSION_NO_TARGET}:${sessionId}`, { voiceNames });
      }
    }
  });

  ipcMain.handle(IPC.VOICE_ABORT, (_event, sessionId: string) => {
    voiceManager.disposeSession(sessionId);
  });

  // --- Composition handlers ---

  ipcMain.handle(
    IPC.COMPOSITION_CREATE,
    (_event, data: Omit<Composition, 'id' | 'createdAt' | 'updatedAt'>) => {
      const now = Date.now();
      const id = generateId();
      const composition: Composition = {
        ...data,
        id,
        voices: data.voices.map((v) => ({ ...v, compositionId: id })),
        createdAt: now,
        updatedAt: now,
        archived: false,
      };
      insertComposition(db, composition);
      return composition;
    },
  );

  ipcMain.handle(IPC.COMPOSITION_LIST, (_event, archived = false) => listCompositions(db, archived));

  ipcMain.handle(IPC.COMPOSITION_GET, (_event, id: string) => getComposition(db, id));

  ipcMain.handle(
    IPC.COMPOSITION_UPDATE,
    (_event, id: string, data: Partial<Composition>) => {
      const oldComposition = getComposition(db, id);

      updateComposition(db, id, data);

      if (data.voices) {
        upsertCompositionVoices(
          db,
          data.voices.map((v) => ({ ...v, compositionId: id })),
        );
      }

      const newComposition = getComposition(db, id);

      if (oldComposition && newComposition && data.voices) {
        const oldIds = new Set(oldComposition.voices.map((v) => v.id));
        const newIds = new Set(newComposition.voices.map((v) => v.id));
        const added = newComposition.voices.filter((v) => !oldIds.has(v.id));
        const removed = oldComposition.voices.filter((v) => !newIds.has(v.id));

        if (added.length > 0 || removed.length > 0) {
          const sessions = listSessionsByCompositionId(db, id);
          const now = Date.now();

          for (const session of sessions) {
            for (const voice of added) {
              insertMessage(db, {
                id: generateId(),
                sessionId: session.id,
                role: 'system',
                voiceId: null,
                voiceName: null,
                content: `Voice "${voice.displayName}" was added to the conversation.`,
                timestamp: now,
                roundIndex: -1,
              });
            }
            for (const voice of removed) {
              insertMessage(db, {
                id: generateId(),
                sessionId: session.id,
                role: 'system',
                voiceId: null,
                voiceName: null,
                content: `Voice "${voice.displayName}" was removed from the conversation.`,
                timestamp: now,
                roundIndex: -1,
              });
            }
            voiceManager.disposeSession(session.id);
          }
        }
      }

      return newComposition;
    },
  );

  ipcMain.handle(IPC.COMPOSITION_DELETE, (_event, id: string) => {
    deleteComposition(db, id);
  });

  ipcMain.handle(IPC.COMPOSITION_ARCHIVE, (_event, id: string, archived: boolean) => {
    archiveComposition(db, id, archived);
  });

  ipcMain.handle(IPC.EXPIRY_CHECK, () => expiryStatus);

  const ALLOWED_EXTERNAL_HOSTS = new Set([
    'polyphon.ai',
    'github.com',
    'x.com',
  ]);

  ipcMain.handle(IPC.SHELL_OPEN_EXTERNAL, (_event, url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || !ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname)) {
        console.warn(`shell:openExternal blocked — not in allowlist: ${url}`);
        return;
      }
    } catch {
      console.warn(`shell:openExternal blocked — invalid URL: ${url}`);
      return;
    }
    return shell.openExternal(url);
  });

  registerSettingsHandlers(db, voiceManager);
}
