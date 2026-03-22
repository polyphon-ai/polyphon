import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { ToneDefinition } from '../../../shared/types';

interface ToneRow {
  id: string;
  name: string;
  description: string;
  is_builtin: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

function rowToToneDefinition(row: ToneRow): ToneDefinition {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isBuiltin: row.is_builtin === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listTones(db: Database.Database): ToneDefinition[] {
  const rows = db
    .prepare('SELECT * FROM tones ORDER BY sort_order ASC, created_at ASC')
    .all() as ToneRow[];
  return rows.map(rowToToneDefinition);
}

export function getTone(db: Database.Database, id: string): ToneDefinition | null {
  const row = db
    .prepare('SELECT * FROM tones WHERE id = ?')
    .get(id) as ToneRow | undefined;
  return row ? rowToToneDefinition(row) : null;
}

export function createTone(
  db: Database.Database,
  data: Pick<ToneDefinition, 'name' | 'description'>,
): ToneDefinition {
  const now = Date.now();
  const id = randomUUID();
  const maxOrder = db
    .prepare('SELECT MAX(sort_order) AS max_order FROM tones')
    .get() as { max_order: number | null } | undefined;
  const sortOrder = (maxOrder?.max_order ?? 0) + 1;

  db.prepare(`
    INSERT INTO tones (id, name, description, is_builtin, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, ?, ?)
  `).run(id, data.name, data.description, sortOrder, now, now);
  return getTone(db, id)!;
}

export function updateTone(
  db: Database.Database,
  id: string,
  data: Partial<Pick<ToneDefinition, 'name' | 'description'>>,
): ToneDefinition {
  const now = Date.now();
  const sets: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];

  if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name); }
  if (data.description !== undefined) { sets.push('description = ?'); values.push(data.description); }

  values.push(id);
  db.prepare(`UPDATE tones SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getTone(db, id)!;
}

export function deleteTone(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM tones WHERE id = ?').run(id);
  // Reset user_profile.default_tone if it references the deleted tone
  const firstTone = db
    .prepare('SELECT id FROM tones ORDER BY sort_order ASC, created_at ASC LIMIT 1')
    .get() as { id: string } | undefined;
  const fallback = firstTone?.id ?? 'collaborative';
  db.prepare(`
    UPDATE user_profile SET default_tone = ?, updated_at = ? WHERE id = 1 AND default_tone = ?
  `).run(fallback, Date.now(), id);
  // Clear tone_override on any composition voices referencing the deleted tone
  db.prepare(`
    UPDATE composition_voices SET tone_override = NULL WHERE tone_override = ?
  `).run(id);
}
