import { DatabaseSync } from 'node:sqlite';
import type { Session } from '../../../shared/types';
import { encryptField, decryptField, type EncryptedField } from '../encryption';

interface SessionRow {
  id: string;
  composition_id: string;
  name: string;
  mode: string;
  continuation_policy: string;
  continuation_max_rounds: number;
  created_at: number;
  updated_at: number;
  archived: number;
  working_dir: EncryptedField | null;
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    compositionId: row.composition_id,
    name: row.name,
    mode: row.mode as Session['mode'],
    continuationPolicy: row.continuation_policy as Session['continuationPolicy'],
    continuationMaxRounds: row.continuation_max_rounds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archived: row.archived === 1,
    workingDir: row.working_dir ? decryptField(row.working_dir) : null,
  };
}

export function listSessions(db: DatabaseSync, archived = false): Session[] {
  const rows = db
    .prepare('SELECT * FROM sessions WHERE archived = ? ORDER BY created_at DESC')
    .all(archived ? 1 : 0) as unknown as SessionRow[];
  return rows.map(rowToSession);
}

export function getSession(db: DatabaseSync, id: string): Session | null {
  const row = db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(id) as SessionRow | undefined;
  return row ? rowToSession(row) : null;
}

export function insertSession(db: DatabaseSync, session: Session): void {
  db.prepare(`
    INSERT INTO sessions (id, composition_id, name, mode, continuation_policy, continuation_max_rounds, created_at, updated_at, working_dir)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    session.id,
    session.compositionId,
    session.name,
    session.mode,
    session.continuationPolicy,
    session.continuationMaxRounds,
    session.createdAt,
    session.updatedAt,
    session.workingDir ? encryptField(session.workingDir) : null,
  );
}

export function deleteSession(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function renameSession(db: DatabaseSync, id: string, name: string): Session | null {
  db.prepare('UPDATE sessions SET name = ?, updated_at = ? WHERE id = ?').run(name, Date.now(), id);
  return getSession(db, id);
}

export function archiveSession(db: DatabaseSync, id: string, archived: boolean): void {
  db.prepare('UPDATE sessions SET archived = ?, updated_at = ? WHERE id = ?').run(
    archived ? 1 : 0,
    Date.now(),
    id,
  );
}

export function listSessionsByCompositionId(db: DatabaseSync, compositionId: string): Session[] {
  const rows = db
    .prepare('SELECT * FROM sessions WHERE composition_id = ?')
    .all(compositionId) as unknown as SessionRow[];
  return rows.map(rowToSession);
}
