import type Database from 'better-sqlite3';
import type { HandlerFn } from '../dispatcher';
import { searchMessages } from '../../db/queries/search';
import { requireSearchQuery } from '../../ipc/validate';

export function buildSearchHandlers(db: Database.Database): Record<string, HandlerFn> {
  return {
    'search.messages': async (params) => {
      const query = requireSearchQuery(params?.query);
      const sessionId = typeof params?.sessionId === 'string' ? params.sessionId : undefined;
      return searchMessages(db, query, sessionId);
    },
  };
}
