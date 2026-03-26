import type Database from 'better-sqlite3';
import type { Session } from '../../../shared/types';

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
  working_dir: string | null;
  sandboxed_to_working_dir: number;
  source: string;
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
    workingDir: row.working_dir,
    sandboxedToWorkingDir: row.sandboxed_to_working_dir === 1,
    source: row.source ?? 'polyphon',
  };
}

export function listSessions(db: Database.Database, archived = false): Session[] {
  const rows = db
    .prepare('SELECT * FROM sessions WHERE archived = ? ORDER BY created_at DESC')
    .all(archived ? 1 : 0) as SessionRow[];
  return rows.map(rowToSession);
}

export function getSession(db: Database.Database, id: string): Session | null {
  const row = db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(id) as SessionRow | undefined;
  return row ? rowToSession(row) : null;
}

export function insertSession(db: Database.Database, session: Session): void {
  db.prepare(`
    INSERT INTO sessions (id, composition_id, name, mode, continuation_policy, continuation_max_rounds, created_at, updated_at, working_dir, sandboxed_to_working_dir, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    session.id,
    session.compositionId,
    session.name,
    session.mode,
    session.continuationPolicy,
    session.continuationMaxRounds,
    session.createdAt,
    session.updatedAt,
    session.workingDir ?? null,
    session.sandboxedToWorkingDir ? 1 : 0,
    session.source,
  );
}

export function deleteSession(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function renameSession(db: Database.Database, id: string, name: string): Session | null {
  db.prepare('UPDATE sessions SET name = ?, updated_at = ? WHERE id = ?').run(name, Date.now(), id);
  return getSession(db, id);
}

export function archiveSession(db: Database.Database, id: string, archived: boolean): void {
  db.prepare('UPDATE sessions SET archived = ?, updated_at = ? WHERE id = ?').run(
    archived ? 1 : 0,
    Date.now(),
    id,
  );
}

export function listSessionsByCompositionId(db: Database.Database, compositionId: string): Session[] {
  const rows = db
    .prepare('SELECT * FROM sessions WHERE composition_id = ?')
    .all(compositionId) as SessionRow[];
  return rows.map(rowToSession);
}
