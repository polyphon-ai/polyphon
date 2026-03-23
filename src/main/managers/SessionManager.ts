import type { BrowserWindow } from 'electron';
import type Database from 'better-sqlite3';
import type { Message, Session } from '../../shared/types';
import type { VoiceManager } from './VoiceManager';
import { IPC, CONTINUATION_MAX_ROUNDS_LIMIT } from '../../shared/constants';
import { insertMessage, listMessages } from '../db/queries/messages';
import { generateId } from '../utils';
import { logger } from '../utils/logger';

// Internal abstraction that decouples "run a round" from "notify the GUI".
// The BrowserWindowSink forwards events to the renderer via IPC.
// The CollectorSink accumulates tokens for headless callers that need a return value.
interface SessionEventSink {
  onVoicePending?(sessionId: string, voiceId: string): void;
  onVoiceToken?(sessionId: string, voiceId: string, token: string): void;
  onVoiceDone?(sessionId: string, voiceId: string, roundIndex: number): void;
  onVoiceError?(sessionId: string, voiceId: string, error: string): void;
  onContinuationPrompt?(sessionId: string, roundIndex: number, voiceResponses: Message[]): void;
  onNoTarget?(sessionId: string): void;
}

class BrowserWindowSink implements SessionEventSink {
  constructor(private win: BrowserWindow) {}

  onVoicePending(sessionId: string, voiceId: string): void {
    this.win.webContents.send(`${IPC.VOICE_PENDING}:${sessionId}`, { voiceId });
  }

  onVoiceToken(sessionId: string, voiceId: string, token: string): void {
    this.win.webContents.send(`${IPC.VOICE_TOKEN}:${sessionId}`, { voiceId, token });
  }

  onVoiceDone(sessionId: string, voiceId: string, roundIndex: number): void {
    this.win.webContents.send(`${IPC.VOICE_DONE}:${sessionId}`, { voiceId, roundIndex });
  }

  onVoiceError(sessionId: string, voiceId: string, error: string): void {
    this.win.webContents.send(`${IPC.VOICE_ERROR}:${sessionId}`, { voiceId, error });
  }

  onContinuationPrompt(sessionId: string, roundIndex: number, voiceResponses: Message[]): void {
    this.win.webContents.send(`${IPC.SESSION_CONTINUATION_PROMPT}:${sessionId}`, {
      roundIndex,
      voiceResponses,
    });
  }

  onNoTarget(sessionId: string): void {
    this.win.webContents.send(`${IPC.SESSION_NO_TARGET}:${sessionId}`, {});
  }
}

class CollectorSink implements SessionEventSink {
  // voiceId → accumulated content
  readonly collected: Map<string, string> = new Map();
  // resolved voice name per voiceId
  readonly voiceNames: Map<string, string> = new Map();

  onVoiceToken(_sessionId: string, voiceId: string, token: string): void {
    this.collected.set(voiceId, (this.collected.get(voiceId) ?? '') + token);
  }

  registerVoice(voiceId: string, voiceName: string): void {
    this.voiceNames.set(voiceId, voiceName);
  }
}

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

  // Streams tokens from a single voice through the provided sink.
  // Returns the full concatenated response.
  private async streamVoice(
    sink: SessionEventSink,
    sessionId: string,
    voiceId: string,
    message: Message,
    context: Message[],
    roundIndex: number,
  ): Promise<string> {
    const voice = this.voiceManager.getVoice(sessionId, voiceId);
    if (!voice) {
      sink.onVoiceError?.(sessionId, voiceId, `Voice not found: ${voiceId}`);
      return '';
    }

    let accumulated = '';
    logger.debug('Voice stream starting', { sessionId, voiceId, roundIndex });
    sink.onVoicePending?.(sessionId, voiceId);
    try {
      for await (const token of voice.send(message, context)) {
        accumulated += token;
        sink.onVoiceToken?.(sessionId, voiceId, token);
      }
      logger.debug('Voice stream complete', { sessionId, voiceId, roundIndex, chars: accumulated.length });
      sink.onVoiceDone?.(sessionId, voiceId, roundIndex);
    } catch (err) {
      if (isAbortError(err)) {
        logger.debug('Voice stream aborted', { sessionId, voiceId, roundIndex });
        sink.onVoiceDone?.(sessionId, voiceId, roundIndex);
        return accumulated;
      }
      const error = err instanceof Error ? err.message : String(err);
      logger.error('Voice stream error', { sessionId, voiceId, error });
      sink.onVoiceError?.(sessionId, voiceId, error);
    }

    return accumulated;
  }

  // Broadcast mode: all voices respond sequentially, each with full context so far
  async runBroadcastRound(
    win: BrowserWindow,
    session: Session,
    conductorMessage: Message,
    db: Database.Database,
    depth = 0,
  ): Promise<void> {
    await this.runBroadcastRoundWithSink(new BrowserWindowSink(win), session, conductorMessage, db, depth);
  }

  // Headless broadcast round — returns collected voice responses
  async runHeadlessBroadcastRound(
    db: Database.Database,
    session: Session,
    conductorMessage: Message,
  ): Promise<Message[]> {
    const sink = new CollectorSink();
    await this.runBroadcastRoundWithSink(sink, session, conductorMessage, db, 0);

    // Build Message objects from collected tokens (already inserted to DB by the inner method)
    const ensemble = this.voiceManager.getEnsemble(session.id);
    const result: Message[] = [];
    for (const voice of ensemble) {
      const content = sink.collected.get(voice.id) ?? '';
      if (content) {
        result.push({
          id: generateId(),
          sessionId: session.id,
          role: 'voice',
          voiceId: voice.id,
          voiceName: voice.name,
          content,
          timestamp: Date.now(),
          roundIndex: this.roundCounters.get(session.id) ?? 0,
        });
      }
    }
    return result;
  }

  // Headless directed round — returns the single voice response or null
  async runHeadlessDirectedRound(
    db: Database.Database,
    session: Session,
    conductorMessage: Message,
    targetVoiceId: string,
  ): Promise<Message | null> {
    const sink = new CollectorSink();
    const voice = this.voiceManager.getVoice(session.id, targetVoiceId);
    if (!voice) return null;

    await this.runDirectedRoundWithSink(sink, session, conductorMessage, targetVoiceId, db);

    const content = sink.collected.get(targetVoiceId);
    if (!content) return null;

    return {
      id: generateId(),
      sessionId: session.id,
      role: 'voice',
      voiceId: voice.id,
      voiceName: voice.name,
      content,
      timestamp: Date.now(),
      roundIndex: this.roundCounters.get(session.id) ?? 0,
    };
  }

  private async runBroadcastRoundWithSink(
    sink: SessionEventSink,
    session: Session,
    conductorMessage: Message,
    db: Database.Database,
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
      const content = await this.streamVoice(sink, session.id, voice.id, conductorMessage, [...context], roundIndex);
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
      logger.debug('Continuation prompt sent', { sessionId: session.id, roundIndex });
      sink.onContinuationPrompt?.(
        session.id,
        this.roundCounters.get(session.id) ?? 0,
        roundResponses,
      );
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
          logger.debug('Auto-continuation: directed to mentioned voices', { sessionId: session.id, depth, maxDepth, mentionedVoiceCount: mentionedVoiceIds.size });
          for (const voiceId of mentionedVoiceIds) {
            await this.runDirectedRoundWithSink(sink, session, continuationMessage, voiceId, db);
          }
        } else {
          logger.debug('Auto-continuation: broadcast (no mentions)', { sessionId: session.id, depth, maxDepth });
          await this.runBroadcastRoundWithSink(sink, session, continuationMessage, db, depth + 1);
        }
      } else {
        logger.debug('Auto-continuation: max depth reached', { sessionId: session.id, depth, maxDepth });
      }
    }
  }

  // Conductor-directed mode: only the @mentioned voice responds
  async runDirectedRound(
    win: BrowserWindow,
    session: Session,
    conductorMessage: Message,
    targetVoiceId: string,
    db: Database.Database,
  ): Promise<void> {
    await this.runDirectedRoundWithSink(new BrowserWindowSink(win), session, conductorMessage, targetVoiceId, db);
  }

  private async runDirectedRoundWithSink(
    sink: SessionEventSink,
    session: Session,
    conductorMessage: Message,
    targetVoiceId: string,
    db: Database.Database,
  ): Promise<void> {
    const voice = this.voiceManager.getVoice(session.id, targetVoiceId);
    if (!voice) {
      sink.onVoiceError?.(session.id, targetVoiceId, `Voice not found: ${targetVoiceId}`);
      return;
    }

    // conductorMessage was already inserted into DB by the VOICE_SEND handler.
    const context = listMessages(db, session.id);
    const roundIndex = this.incrementRound(session.id);
    logger.info('Directed round starting', { sessionId: session.id, roundIndex, mode: 'directed', voiceId: targetVoiceId });
    const content = await this.streamVoice(sink, session.id, targetVoiceId, conductorMessage, context, roundIndex);
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
