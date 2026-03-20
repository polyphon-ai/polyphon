import type { BrowserWindow } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import type { Message, Session } from '../../shared/types';
import type { VoiceManager } from './VoiceManager';
import { IPC, CONTINUATION_MAX_ROUNDS_LIMIT } from '../../shared/constants';
import { insertMessage, listMessages } from '../db/queries/messages';
import { generateId } from '../utils';
import { logger } from '../utils/logger';

export class SessionManager {
  private voiceManager: VoiceManager;
  // sessionId → round index counter
  private roundCounters: Map<string, number> = new Map();

  constructor(voiceManager: VoiceManager) {
    this.voiceManager = voiceManager;
  }

  // Parses an @mention from conductor input, returns the matched voice name or null.
  // When multiple mentions are present, returns the first one by text position.
  parseMention(content: string, voiceNames: string[]): string | null {
    let firstMatch: { index: number; name: string } | null = null;

    for (const name of voiceNames) {
      const pattern = new RegExp(`(?:^|\\s)@${escapeRegex(name)}(?:\\s|$|[,.!?])`, 'i');
      const match = pattern.exec(content);
      if (match && (firstMatch === null || match.index < firstMatch.index)) {
        firstMatch = { index: match.index, name };
      }
    }

    return firstMatch?.name ?? null;
  }

  // Streams tokens from a single voice back to the renderer via IPC events.
  // Returns the full concatenated response.
  private async streamVoice(
    win: BrowserWindow,
    sessionId: string,
    voiceId: string,
    message: Message,
    context: Message[],
    roundIndex: number,
  ): Promise<string> {
    const voice = this.voiceManager.getVoice(sessionId, voiceId);
    if (!voice) {
      win.webContents.send(`${IPC.VOICE_ERROR}:${sessionId}`, {
        voiceId,
        error: `Voice not found: ${voiceId}`,
      });
      return '';
    }

    let accumulated = '';
    win.webContents.send(`${IPC.VOICE_PENDING}:${sessionId}`, { voiceId });
    try {
      for await (const token of voice.send(message, context)) {
        accumulated += token;
        win.webContents.send(`${IPC.VOICE_TOKEN}:${sessionId}`, { voiceId, token });
      }
      win.webContents.send(`${IPC.VOICE_DONE}:${sessionId}`, { voiceId, roundIndex });
    } catch (err) {
      if (isAbortError(err)) {
        win.webContents.send(`${IPC.VOICE_DONE}:${sessionId}`, { voiceId, roundIndex });
        return accumulated;
      }
      const error = err instanceof Error ? err.message : String(err);
      logger.error('Voice stream error', { sessionId, voiceId, error });
      win.webContents.send(`${IPC.VOICE_ERROR}:${sessionId}`, { voiceId, error });
    }

    return accumulated;
  }

  // Broadcast mode: all voices respond sequentially, each with full context so far
  async runBroadcastRound(
    win: BrowserWindow,
    session: Session,
    conductorMessage: Message,
    db: DatabaseSync,
    depth = 0,
  ): Promise<void> {
    const ensemble = this.voiceManager.getEnsemble(session.id);
    // conductorMessage was already inserted into DB by the VOICE_SEND handler,
    // so listMessages includes it — do not append again.
    const context = listMessages(db, session.id);
    const roundIndex = this.incrementRound(session.id);
    logger.info('Broadcast round starting', { sessionId: session.id, roundIndex, mode: 'broadcast', voiceCount: ensemble.length });
    const roundResponses: Message[] = [];

    for (const voice of ensemble) {
      const content = await this.streamVoice(win, session.id, voice.id, conductorMessage, [...context], roundIndex);
      const voiceMessage: Message = {
        id: generateId(),
        sessionId: session.id,
        role: 'voice',
        voiceId: voice.id,
        voiceName: voice.name,
        content,
        timestamp: Date.now(),
        roundIndex,
      };
      insertMessage(db, voiceMessage);
      context.push(voiceMessage);
      roundResponses.push(voiceMessage);
    }

    logger.info('Broadcast round complete', { sessionId: session.id, roundIndex, voiceCount: roundResponses.length });

    // Continuation policy
    if (session.continuationPolicy === 'none') return;

    if (session.continuationPolicy === 'prompt') {
      win.webContents.send(`${IPC.SESSION_CONTINUATION_PROMPT}:${session.id}`, {
        roundIndex: this.roundCounters.get(session.id) ?? 0,
        voiceResponses: roundResponses,
      });
      return;
    }

    if (session.continuationPolicy === 'auto') {
      const voiceNames = ensemble.map((v) => v.name);
      const maxDepth = Math.min(session.continuationMaxRounds - 1, CONTINUATION_MAX_ROUNDS_LIMIT - 1);

      if (depth < maxDepth) {
        // Find voices that were specifically @mentioned by any response this round
        const mentionedVoiceIds = new Set<string>();
        for (const msg of roundResponses) {
          const mentionedName = this.parseMention(msg.content, voiceNames);
          if (mentionedName) {
            const target = ensemble.find((v) => v.name === mentionedName);
            if (target) mentionedVoiceIds.add(target.id);
          }
        }

        const continuationMessage: Message = {
          id: generateId(),
          sessionId: session.id,
          role: 'conductor',
          voiceId: null,
          voiceName: null,
          content: '',
          timestamp: Date.now(),
          roundIndex: this.roundCounters.get(session.id) ?? 0,
        };

        if (mentionedVoiceIds.size > 0) {
          // Only the specifically @mentioned voices respond
          for (const voiceId of mentionedVoiceIds) {
            await this.runDirectedRound(win, session, continuationMessage, voiceId, db);
          }
        } else {
          // No specific @mentions — broadcast to all voices
          await this.runBroadcastRound(win, session, continuationMessage, db, depth + 1);
        }
      }
    }
  }

  // Conductor-directed mode: only the @mentioned voice responds
  async runDirectedRound(
    win: BrowserWindow,
    session: Session,
    conductorMessage: Message,
    targetVoiceId: string,
    db: DatabaseSync,
  ): Promise<void> {
    const voice = this.voiceManager.getVoice(session.id, targetVoiceId);
    if (!voice) {
      win.webContents.send(`${IPC.VOICE_ERROR}:${session.id}`, {
        voiceId: targetVoiceId,
        error: `Voice not found: ${targetVoiceId}`,
      });
      return;
    }

    // conductorMessage was already inserted into DB by the VOICE_SEND handler.
    const context = listMessages(db, session.id);
    const roundIndex = this.incrementRound(session.id);
    logger.info('Directed round starting', { sessionId: session.id, roundIndex, mode: 'directed', voiceId: targetVoiceId });
    const content = await this.streamVoice(win, session.id, targetVoiceId, conductorMessage, context, roundIndex);
    const voiceMessage: Message = {
      id: generateId(),
      sessionId: session.id,
      role: 'voice',
      voiceId: voice.id,
      voiceName: voice.name,
      content,
      timestamp: Date.now(),
      roundIndex,
    };
    insertMessage(db, voiceMessage);
  }

  incrementRound(sessionId: string): number {
    const next = (this.roundCounters.get(sessionId) ?? 0) + 1;
    this.roundCounters.set(sessionId, next);
    return next;
  }

  disposeSession(sessionId: string): void {
    this.roundCounters.delete(sessionId);
    this.voiceManager.disposeSession(sessionId);
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === 'AbortError' || err.name === 'APIUserAbortError';
}
