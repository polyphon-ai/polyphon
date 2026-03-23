import type Database from 'better-sqlite3';
import type { Session, Message } from '../../../shared/types';
import { getSession } from '../../db/queries/sessions';
import { listMessages } from '../../db/queries/messages';
import { requireId } from '../../ipc/validate';

interface GetHistoryInput {
  sessionId: unknown;
  limit?: unknown;
}

interface GetHistoryResult {
  session: Session;
  messages: Message[];
}

export function buildGetHistoryTool(db: Database.Database) {
  return async (input: GetHistoryInput): Promise<GetHistoryResult> => {
    const sessionId = requireId(input.sessionId, 'sessionId');

    let limit: number | undefined;
    if (input.limit != null) {
      if (typeof input.limit !== 'number' || !Number.isInteger(input.limit) || input.limit < 1) {
        throw new Error('limit must be a positive integer');
      }
      limit = input.limit as number;
    }

    const session = getSession(db, sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    let messages = listMessages(db, sessionId);
    if (limit !== undefined) {
      messages = messages.slice(-limit);
    }

    return { session, messages };
  };
}
