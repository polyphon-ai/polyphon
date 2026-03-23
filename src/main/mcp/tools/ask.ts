import type Database from 'better-sqlite3';
import type { Message } from '../../../shared/types';
import type { VoiceManager } from '../../managers/VoiceManager';
import type { SessionManager } from '../../managers/SessionManager';
import { getSession } from '../../db/queries/sessions';
import { insertMessage } from '../../db/queries/messages';
import { requireId, requireString, requireNonEmptyString, MAX_NAME } from '../../ipc/validate';
import { ensureSessionInitialized } from '../headless';
import { generateId } from '../../utils';
import { logger } from '../../utils/logger';

const MAX_CONTENT = 50000;

interface AskInput {
  sessionId: unknown;
  content: unknown;
  voiceName: unknown;
}

interface AskResult {
  voiceName: string;
  content: string;
  roundIndex: number;
}

export function buildAskTool(
  db: Database.Database,
  voiceManager: VoiceManager,
  sessionManager: SessionManager,
) {
  return async (input: AskInput): Promise<AskResult> => {
    const sessionId = requireId(input.sessionId, 'sessionId');
    const content = requireString(input.content, 'content', MAX_CONTENT);
    const targetName = requireNonEmptyString(input.voiceName, 'voiceName', MAX_NAME);

    const session = getSession(db, sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    await ensureSessionInitialized(db, voiceManager, session);

    const ensemble = voiceManager.getEnsemble(session.id);
    const matches = ensemble.filter(
      (v) => v.name.toLowerCase() === targetName.toLowerCase(),
    );

    if (matches.length === 0) {
      const available = ensemble.map((v) => v.name).join(', ');
      throw new Error(
        `Voice not found: "${targetName}". Available voices: ${available || '(none)'}`,
      );
    }

    if (matches.length > 1) {
      const ids = matches.map((v) => `${v.name} (id: ${v.id})`).join(', ');
      throw new Error(
        `Multiple voices share the name "${targetName}": ${ids}. Use a unique voice name.`,
      );
    }

    const targetVoice = matches[0]!;

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

    logger.debug('[mcp] ask starting', { sessionId, voiceName: targetName });
    const response = await sessionManager.runHeadlessDirectedRound(db, session, conductorMessage, targetVoice.id);

    if (!response) {
      throw new Error(`Voice "${targetName}" did not produce a response`);
    }

    logger.debug('[mcp] ask complete', { sessionId, voiceName: targetName });
    return {
      voiceName: response.voiceName ?? targetName,
      content: response.content,
      roundIndex: response.roundIndex,
    };
  };
}
