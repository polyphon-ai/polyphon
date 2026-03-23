import type Database from 'better-sqlite3';
import type { Message } from '../../../shared/types';
import type { VoiceManager } from '../../managers/VoiceManager';
import type { SessionManager } from '../../managers/SessionManager';
import { getSession } from '../../db/queries/sessions';
import { insertMessage } from '../../db/queries/messages';
import { requireId, requireString } from '../../ipc/validate';
import { ensureSessionInitialized } from '../headless';
import { generateId } from '../../utils';
import { logger } from '../../utils/logger';

const MAX_CONTENT = 50000;

interface BroadcastInput {
  sessionId: unknown;
  content: unknown;
}

interface BroadcastResult {
  responses: Array<{ voiceName: string; content: string }>;
  roundIndex: number;
}

export function buildBroadcastTool(
  db: Database.Database,
  voiceManager: VoiceManager,
  sessionManager: SessionManager,
) {
  return async (input: BroadcastInput): Promise<BroadcastResult> => {
    const sessionId = requireId(input.sessionId, 'sessionId');
    const content = requireString(input.content, 'content', MAX_CONTENT);

    const session = getSession(db, sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    await ensureSessionInitialized(db, voiceManager, session);

    const conductorMessage: Message = {
      id: generateId(),
      sessionId,
      role: 'conductor',
      voiceId: null,
      voiceName: null,
      content,
      timestamp: Date.now(),
      roundIndex: 0,
    };
    insertMessage(db, conductorMessage);

    logger.debug('[mcp] broadcast starting', { sessionId });
    const voiceMessages = await sessionManager.runHeadlessBroadcastRound(db, session, conductorMessage);
    const roundIndex = voiceMessages[0]?.roundIndex ?? 0;

    logger.debug('[mcp] broadcast complete', { sessionId, responseCount: voiceMessages.length });
    return {
      responses: voiceMessages.map((m) => ({
        voiceName: m.voiceName ?? m.voiceId ?? 'unknown',
        content: m.content,
      })),
      roundIndex,
    };
  };
}
