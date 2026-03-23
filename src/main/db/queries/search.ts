import type Database from 'better-sqlite3';
import type { SearchResult } from '../../../shared/types';

interface SearchRow {
  id: string;
  session_id: string;
  session_name: string;
  role: string;
  voice_name: string | null;
  snippet: string;
  timestamp: number;
  archived: number;
}

// Strip FTS5 special operators and escape embedded double-quotes.
function normalizeFtsQuery(query: string): string {
  // Remove bare FTS5 operator tokens and prefix/phrase operators
  const stripped = query
    .replace(/\bAND\b/g, '')
    .replace(/\bOR\b/g, '')
    .replace(/\bNOT\b/g, '')
    .replace(/[*^:]/g, '')
    .replace(/"/g, '""') // escape embedded double-quotes
    .trim();
  return stripped;
}

export function searchMessages(
  db: Database.Database,
  query: string,
  sessionId?: string,
): SearchResult[] {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const normalized = normalizeFtsQuery(trimmed);
  if (normalized.length < 2) return [];

  try {
    let sql = `
      SELECT m.id, m.session_id, m.role, m.voice_name, m.timestamp,
             s.name AS session_name,
             s.archived,
             snippet(messages_fts, 0, '<mark>', '</mark>', '…', 18) AS snippet
      FROM messages_fts
      JOIN messages m ON m.rowid = messages_fts.rowid
      JOIN sessions s ON s.id = m.session_id
      WHERE messages_fts MATCH ?
        AND s.archived = 0
    `;
    const params: unknown[] = [normalized];

    if (sessionId) {
      sql += ' AND m.session_id = ?';
      params.push(sessionId);
    }

    if (sessionId) {
      sql += ' ORDER BY m.timestamp ASC LIMIT 50';
    } else {
      sql += ' ORDER BY bm25(messages_fts), m.timestamp DESC LIMIT 50';
    }

    const rows = db.prepare(sql).all(...params) as SearchRow[];
    return rows.map((row) => ({
      messageId: row.id,
      sessionId: row.session_id,
      sessionName: row.session_name,
      role: row.role as SearchResult['role'],
      voiceName: row.voice_name,
      snippet: row.snippet,
      timestamp: row.timestamp,
      archived: row.archived === 1,
    }));
  } catch {
    return [];
  }
}
