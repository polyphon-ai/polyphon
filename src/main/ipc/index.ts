import { ipcMain, BrowserWindow, shell, app, dialog } from 'electron';
import { URL } from 'url';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Message, Composition } from '../../shared/types';
import { IPC } from '../../shared/constants';
import { logger, isDebugEnabled, setDebugEnabled, writeDebugFlag } from '../utils/logger';
import { registerSettingsHandlers } from './settingsHandlers';
import type { EncryptionContext } from './settingsHandlers';
import {
  requireId,
  requireString,
  requireCompositionData,
  requirePartialCompositionData,
  requireMessageShape,
  coerceBoolean,
  MAX_NAME,
} from './validate';
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
import { getUserProfile, setDismissedUpdateVersion, setUpdateRemindAfter, getUpdateChannel, setUpdateChannel } from '../db/queries/userProfile';
import { getCachedUpdateInfo, checkForUpdateNow, downloadUpdate, quitAndInstall, changeChannel } from '../utils/updateChecker';
import type { UpdateChannel } from '../../shared/types';

export function registerIpcHandlers(
  db: DatabaseSync,
  voiceManager: VoiceManager,
  sessionManager: SessionManager,
  encCtx?: EncryptionContext,
): void {
  // --- Session handlers ---

  ipcMain.handle(IPC.SESSION_CREATE, async (_event, compositionId: unknown, name: unknown, workingDir: unknown, sandboxedToWorkingDir: unknown) => {
    const validCompositionId = requireId(compositionId, 'compositionId');
    const validName = requireString(name, 'name', MAX_NAME);
    const validWorkingDir = (typeof workingDir === 'string' && workingDir.trim().length > 0)
      ? workingDir.trim()
      : null;
    const validSandboxed = validWorkingDir !== null && sandboxedToWorkingDir === true;
    const composition = getComposition(db, validCompositionId);
    if (!composition) throw new Error(`Composition not found: ${validCompositionId}`);

    const voices = composition.voices.map((cv) => voiceManager.createVoice(cv));
    const now = Date.now();
    const session = {
      id: generateId(),
      compositionId: validCompositionId,
      name: validName,
      mode: composition.mode,
      continuationPolicy: composition.continuationPolicy,
      continuationMaxRounds: composition.continuationMaxRounds,
      createdAt: now,
      updatedAt: now,
      archived: false,
      workingDir: validWorkingDir,
      sandboxedToWorkingDir: validSandboxed,
    };

    const profile = getUserProfile(db);
    voiceManager.initSession(session.id, voices, session.mode, profile, validWorkingDir, validSandboxed);
    insertSession(db, session);
    logger.debug('session:create', { sessionId: session.id, compositionId: validCompositionId, mode: session.mode, voiceCount: voices.length, hasWorkingDir: validWorkingDir !== null, sandboxed: validSandboxed });
    return session;
  });

  ipcMain.handle(IPC.SESSION_PICK_WORKING_DIR, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose Working Directory',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(IPC.SESSION_VALIDATE_WORKING_DIR, async (_event, dirPath: unknown) => {
    if (typeof dirPath !== 'string' || !dirPath.trim()) return false;
    try {
      const stats = await fs.promises.stat(dirPath.trim());
      return stats.isDirectory();
    } catch {
      return false;
    }
  });

  ipcMain.handle(IPC.SESSION_LIST, async (_event, archived: unknown) =>
    listSessions(db, coerceBoolean(archived, 'archived')),
  );

  ipcMain.handle(IPC.SESSION_GET, async (_event, id: unknown) => {
    requireId(id, 'id');
    return getSession(db, id as string);
  });

  ipcMain.handle(IPC.SESSION_MESSAGES_LIST, async (_event, sessionId: unknown) => {
    requireId(sessionId, 'sessionId');
    return listMessages(db, sessionId as string);
  });

  ipcMain.handle(IPC.SESSION_RENAME, async (_event, id: unknown, name: unknown) => {
    requireId(id, 'id');
    requireString(name, 'name', MAX_NAME);
    return renameSession(db, id as string, name as string);
  });

  ipcMain.handle(IPC.SESSION_DELETE, async (_event, id: unknown) => {
    requireId(id, 'id');
    sessionManager.disposeSession(id as string);
    deleteSession(db, id as string);
  });

  ipcMain.handle(IPC.SESSION_ARCHIVE, async (_event, id: unknown, archived: unknown) => {
    requireId(id, 'id');
    archiveSession(db, id as string, coerceBoolean(archived, 'archived'));
  });

  // --- Voice handlers ---

  ipcMain.handle(IPC.VOICE_SEND, async (event, sessionId: unknown, message: unknown) => {
    const validSessionId = requireId(sessionId, 'sessionId');
    const validMessage = requireMessageShape(message);
    const session = getSession(db, validSessionId);
    if (!session) throw new Error(`Session not found: ${validSessionId}`);

    insertMessage(db, validMessage);

    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    // Re-initialize from the DB composition if the in-memory session was lost
    // (e.g. after an app restart when the user resumes an existing session).
    let ensemble = voiceManager.getEnsemble(validSessionId);
    if (ensemble.length === 0) {
      const composition = getComposition(db, session.compositionId);
      if (composition && composition.voices.length > 0) {
        const voices = composition.voices.map((cv) => voiceManager.createVoice(cv));
        const profile = getUserProfile(db);
        voiceManager.initSession(validSessionId, voices, session.mode, profile);
        ensemble = voiceManager.getEnsemble(validSessionId);
        logger.debug('voice:send re-initialized session from DB', { sessionId: validSessionId, voiceCount: voices.length });
      }
    }

    const voiceNames = ensemble.map((v) => v.name);
    const mentionedName = sessionManager.parseMention(validMessage.content, voiceNames);
    const targetVoice = mentionedName ? ensemble.find((v) => v.name === mentionedName) : null;

    logger.debug('voice:send routing', { sessionId: validSessionId, mode: session.mode, mentioned: mentionedName ?? null, targetVoiceId: targetVoice?.id ?? null });

    if (session.mode === 'broadcast') {
      if (targetVoice) {
        // Conductor directed a specific voice within a broadcast session
        await sessionManager.runDirectedRound(win, session, validMessage, targetVoice.id, db);
      } else {
        await sessionManager.runBroadcastRound(win, session, validMessage, db);
      }
    } else {
      if (targetVoice) {
        await sessionManager.runDirectedRound(win, session, validMessage, targetVoice.id, db);
      } else {
        // Directed mode with no @mention — notify the renderer so the UI can
        // prompt the conductor to address a specific voice.
        logger.warn('Session no target — conductor message has no @mention in directed mode', { sessionId: validSessionId });
        win.webContents.send(`${IPC.SESSION_NO_TARGET}:${validSessionId}`, { voiceNames });
      }
    }
  });

  ipcMain.handle(IPC.VOICE_ABORT, async (_event, sessionId: unknown) => {
    requireId(sessionId, 'sessionId');
    logger.debug('voice:abort', { sessionId });
    voiceManager.disposeSession(sessionId as string);
  });

  // --- Composition handlers ---

  ipcMain.handle(
    IPC.COMPOSITION_CREATE,
    async (_event, data: unknown) => {
      const validData = requireCompositionData(data);
      const now = Date.now();
      const id = generateId();
      const composition: Composition = {
        ...validData,
        id,
        voices: validData.voices.map((v) => ({ ...v, compositionId: id })),
        createdAt: now,
        updatedAt: now,
        archived: false,
      };
      insertComposition(db, composition);
      return composition;
    },
  );

  ipcMain.handle(IPC.COMPOSITION_LIST, async (_event, archived: unknown) =>
    listCompositions(db, coerceBoolean(archived, 'archived')),
  );

  ipcMain.handle(IPC.COMPOSITION_GET, async (_event, id: unknown) => {
    requireId(id, 'id');
    return getComposition(db, id as string);
  });

  ipcMain.handle(
    IPC.COMPOSITION_UPDATE,
    async (_event, id: unknown, data: unknown) => {
      const validId = requireId(id, 'id');
      requirePartialCompositionData(data);
      const compositionData = data as Partial<Composition>;
      const oldComposition = getComposition(db, validId);

      updateComposition(db, validId, compositionData);

      if (compositionData.voices) {
        upsertCompositionVoices(
          db,
          compositionData.voices.map((v) => ({ ...v, compositionId: validId })),
        );
      }

      const newComposition = getComposition(db, validId);

      if (oldComposition && newComposition && compositionData.voices) {
        const oldIds = new Set(oldComposition.voices.map((v) => v.id));
        const newIds = new Set(newComposition.voices.map((v) => v.id));
        const added = newComposition.voices.filter((v) => !oldIds.has(v.id));
        const removed = oldComposition.voices.filter((v) => !newIds.has(v.id));

        if (added.length > 0 || removed.length > 0) {
          const sessions = listSessionsByCompositionId(db, validId);
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

  ipcMain.handle(IPC.COMPOSITION_DELETE, async (_event, id: unknown) => {
    requireId(id, 'id');
    deleteComposition(db, id as string);
  });

  ipcMain.handle(IPC.COMPOSITION_ARCHIVE, async (_event, id: unknown, archived: unknown) => {
    requireId(id, 'id');
    archiveComposition(db, id as string, coerceBoolean(archived, 'archived'));
  });

  const ALLOWED_EXTERNAL_HOSTS = new Set([
    'polyphon.ai',
    'github.com',
    'x.com',
  ]);

  ipcMain.handle(IPC.SHELL_OPEN_EXTERNAL, (_event, url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || !ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname)) {
        logger.warn('shell:openExternal blocked — not in allowlist', { url });
        return;
      }
    } catch {
      logger.warn('shell:openExternal blocked — invalid URL', { url });
      return;
    }
    return shell.openExternal(url);
  });

  // --- Update handlers ---

  ipcMain.handle(IPC.UPDATE_GET_STATE, () => getCachedUpdateInfo());

  ipcMain.handle(IPC.UPDATE_CHECK_NOW, async () => checkForUpdateNow());

  ipcMain.handle(IPC.UPDATE_DOWNLOAD, async () => downloadUpdate());

  ipcMain.handle(IPC.UPDATE_INSTALL, () => quitAndInstall());

  ipcMain.handle(IPC.UPDATE_GET_CHANNEL, () => getUpdateChannel(db));

  ipcMain.handle(IPC.UPDATE_SET_CHANNEL, (_event, channel: unknown) => {
    if (channel !== 'stable' && channel !== 'preview') return;
    setUpdateChannel(db, channel as UpdateChannel);
    changeChannel(channel as UpdateChannel);
  });

  // Accepts stable (X.Y.Z) and alpha/beta pre-releases (X.Y.Z-alpha.N, X.Y.Z-beta.N)
  const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-(alpha|beta)\.\d+)?$/;
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  ipcMain.handle(
    IPC.UPDATE_DISMISS,
    (_event, version: string, permanently: boolean, now = Date.now()) => {
      if (!VERSION_PATTERN.test(version)) return;
      if (permanently) {
        setDismissedUpdateVersion(db, version);
      } else {
        setUpdateRemindAfter(db, now + TWENTY_FOUR_HOURS);
      }
    },
  );

  registerSettingsHandlers(db, voiceManager, encCtx);

  // --- Log handlers ---

  ipcMain.handle(IPC.LOGS_GET_PATHS, () => {
    return { appLog: path.join(app.getPath('userData'), 'logs', 'polyphon.log') };
  });

  ipcMain.handle(IPC.LOGS_GET_RECENT, async () => {
    const logPath = path.join(app.getPath('userData'), 'logs', 'polyphon.log');
    try {
      const content = await fs.promises.readFile(logPath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      return lines.slice(-500);
    } catch {
      return [];
    }
  });

  ipcMain.handle(IPC.LOGS_GET_DEBUG_ENABLED, () => isDebugEnabled());

  ipcMain.handle(IPC.LOGS_SET_DEBUG_ENABLED, (_event, enabled: unknown) => {
    const on = enabled === true;
    setDebugEnabled(on);
    writeDebugFlag(on);
  });

  ipcMain.handle(IPC.LOGS_EXPORT, async () => {
    const fileName = 'polyphon.log';
    const sourceFile = path.join(app.getPath('userData'), 'logs', fileName);

    try {
      await fs.promises.access(sourceFile);
    } catch {
      return { ok: false, error: 'Log file not found' };
    }

    const result = await dialog.showSaveDialog({
      defaultPath: fileName,
      filters: [{ name: 'Log Files', extensions: ['log', 'txt'] }],
    });

    if (result.canceled || !result.filePath) return { ok: false, error: 'Cancelled' };

    try {
      await fs.promises.copyFile(sourceFile, result.filePath);
      return { ok: true };
    } catch (err) {
      logger.warn('Log export failed', err);
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle(IPC.SESSION_EXPORT, async (_event, sessionId: unknown, format: unknown) => {
    requireId(sessionId, 'sessionId');
    if (format !== 'markdown' && format !== 'json' && format !== 'plaintext') {
      return { ok: false, error: 'Invalid format' };
    }

    const session = getSession(db, sessionId as string);
    if (!session) return { ok: false, error: 'Session not found' };

    const messages = listMessages(db, sessionId as string);
    const exportedAt = new Date().toISOString();
    const safeSessionName = session.name.replace(/[/\\:*?"<>|]/g, '_').slice(0, 60);

    let content: string;
    let ext: string;
    let filterName: string;

    if (format === 'json') {
      ext = 'json';
      filterName = 'JSON Files';
      content = JSON.stringify({ session, exportedAt, messages }, null, 2);
    } else if (format === 'markdown') {
      ext = 'md';
      filterName = 'Markdown Files';
      const modeLabel = session.mode === 'conductor' ? 'Directed' : 'Broadcast';
      const lines: string[] = [
        `# ${session.name}`,
        '',
        `- **Mode:** ${modeLabel}`,
        `- **Exported:** ${exportedAt}`,
        '',
        '---',
        '',
      ];
      for (const msg of messages) {
        if (msg.role === 'system') {
          lines.push(`> _${msg.content}_`, '');
          continue;
        }
        const speaker = msg.role === 'conductor' ? 'You' : (msg.voiceName ?? msg.voiceId ?? 'Voice');
        const ts = new Date(msg.timestamp).toISOString();
        lines.push(`**${speaker}** · ${ts}`, '', msg.content, '', '---', '');
      }
      content = lines.join('\n');
    } else {
      ext = 'txt';
      filterName = 'Text Files';
      const modeLabel = session.mode === 'conductor' ? 'Directed' : 'Broadcast';
      const divider = '='.repeat(72);
      const lines: string[] = [
        `Session: ${session.name}`,
        `Mode: ${modeLabel}`,
        `Exported: ${exportedAt}`,
        divider,
        '',
      ];
      for (const msg of messages) {
        if (msg.role === 'system') {
          lines.push(`[system] ${msg.content}`, '');
          continue;
        }
        const speaker = msg.role === 'conductor' ? 'You' : (msg.voiceName ?? msg.voiceId ?? 'Voice');
        const ts = new Date(msg.timestamp).toISOString();
        lines.push(`[${ts}] ${speaker}:`, msg.content, '');
      }
      content = lines.join('\n');
    }

    const defaultPath = `${safeSessionName}.${ext}`;
    const saveResult = await dialog.showSaveDialog({
      defaultPath,
      filters: [{ name: filterName, extensions: [ext] }],
    });

    if (saveResult.canceled || !saveResult.filePath) return { ok: false, error: 'Cancelled' };

    try {
      await fs.promises.writeFile(saveResult.filePath, content, 'utf-8');
      logger.debug('session:export', { sessionId, format, path: saveResult.filePath });
      return { ok: true };
    } catch (err) {
      logger.warn('Session export failed', err);
      return { ok: false, error: String(err) };
    }
  });
}
