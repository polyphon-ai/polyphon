import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { SystemPromptTemplate } from '../../../shared/types';

interface SystemPromptTemplateRow {
  id: string;
  name: string;
  content: string;
  created_at: number;
  updated_at: number;
}

function rowToSystemPromptTemplate(row: SystemPromptTemplateRow): SystemPromptTemplate {
  return {
    id: row.id,
    name: row.name,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listSystemPromptTemplates(db: Database.Database): SystemPromptTemplate[] {
  const rows = db
    .prepare('SELECT * FROM system_prompt_templates ORDER BY created_at ASC')
    .all() as SystemPromptTemplateRow[];
  return rows.map(rowToSystemPromptTemplate);
}

export function getSystemPromptTemplate(db: Database.Database, id: string): SystemPromptTemplate | null {
  const row = db
    .prepare('SELECT * FROM system_prompt_templates WHERE id = ?')
    .get(id) as SystemPromptTemplateRow | undefined;
  return row ? rowToSystemPromptTemplate(row) : null;
}

export function createSystemPromptTemplate(
  db: Database.Database,
  data: Pick<SystemPromptTemplate, 'name' | 'content'>,
): SystemPromptTemplate {
  const now = Date.now();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO system_prompt_templates (id, name, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, data.name, data.content, now, now);
  return getSystemPromptTemplate(db, id)!;
}

export function updateSystemPromptTemplate(
  db: Database.Database,
  id: string,
  data: Partial<Pick<SystemPromptTemplate, 'name' | 'content'>>,
): SystemPromptTemplate {
  const now = Date.now();
  const sets: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];

  if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name); }
  if (data.content !== undefined) { sets.push('content = ?'); values.push(data.content); }

  values.push(id);
  db.prepare(`UPDATE system_prompt_templates SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getSystemPromptTemplate(db, id)!;
}

export function deleteSystemPromptTemplate(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM system_prompt_templates WHERE id = ?').run(id);
  // Clear system_prompt_template_id on any composition voices referencing this template
  // The system_prompt (inline snapshot) is preserved
  db.prepare(`
    UPDATE composition_voices SET system_prompt_template_id = NULL WHERE system_prompt_template_id = ?
  `).run(id);
}
