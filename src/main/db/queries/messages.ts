import { DatabaseSync } from 'node:sqlite';
import type { Message } from '../../../shared/types';

interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  voice_id: string | null;
  voice_name: string | null;
  content: string;
  timestamp: number;
  round_index: number;
  metadata: string | null;
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as Message['role'],
    voiceId: row.voice_id,
    voiceName: row.voice_name,
    content: row.content,
    timestamp: row.timestamp,
    roundIndex: row.round_index,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
  };
}

export function listMessages(db: DatabaseSync, sessionId: string): Message[] {
  const rows = db
    .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC')
    .all(sessionId) as unknown as MessageRow[];
  return rows.map(rowToMessage);
}

export function insertMessage(db: DatabaseSync, message: Message): void {
  db.prepare(`
    INSERT INTO messages (id, session_id, role, voice_id, voice_name, content, timestamp, round_index, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    message.id,
    message.sessionId,
    message.role,
    message.voiceId,
    message.voiceName,
    message.content,
    message.timestamp,
    message.roundIndex,
    message.metadata ? JSON.stringify(message.metadata) : null,
  );
}

export function deleteMessagesBySession(db: DatabaseSync, sessionId: string): void {
  db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
}
