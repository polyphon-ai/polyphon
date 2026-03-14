import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { randomUUID } from 'crypto';
import type { CustomProvider } from '../../../shared/types';

interface CustomProviderRow {
  id: string;
  name: string;
  slug: string;
  base_url: string;
  api_key_env_var: string | null;
  default_model: string | null;
  deleted: number;
  created_at: number;
  updated_at: number;
}

function rowToCustomProvider(row: CustomProviderRow): CustomProvider {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    baseUrl: row.base_url,
    apiKeyEnvVar: row.api_key_env_var,
    defaultModel: row.default_model,
    deleted: row.deleted === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listCustomProviders(db: DatabaseSync): CustomProvider[] {
  const rows = db
    .prepare('SELECT * FROM custom_providers WHERE deleted = 0 ORDER BY created_at ASC')
    .all() as unknown as CustomProviderRow[];
  return rows.map(rowToCustomProvider);
}

export function getCustomProvider(db: DatabaseSync, id: string): CustomProvider | null {
  const row = db
    .prepare('SELECT * FROM custom_providers WHERE id = ?')
    .get(id) as CustomProviderRow | undefined;
  return row ? rowToCustomProvider(row) : null;
}

export function createCustomProvider(
  db: DatabaseSync,
  data: Omit<CustomProvider, 'id' | 'deleted' | 'createdAt' | 'updatedAt'>,
): CustomProvider {
  const now = Date.now();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO custom_providers (id, name, slug, base_url, api_key_env_var, default_model, deleted, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(id, data.name, data.slug, data.baseUrl, data.apiKeyEnvVar ?? null, data.defaultModel ?? null, now, now);
  return getCustomProvider(db, id)!;
}

export function updateCustomProvider(
  db: DatabaseSync,
  id: string,
  data: Partial<Omit<CustomProvider, 'id' | 'slug' | 'deleted' | 'createdAt' | 'updatedAt'>>,
): CustomProvider {
  const now = Date.now();
  const sets: string[] = ['updated_at = ?'];
  const values: SQLInputValue[] = [now];

  if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name); }
  if (data.baseUrl !== undefined) { sets.push('base_url = ?'); values.push(data.baseUrl); }
  if ('apiKeyEnvVar' in data) { sets.push('api_key_env_var = ?'); values.push(data.apiKeyEnvVar ?? null); }
  if ('defaultModel' in data) { sets.push('default_model = ?'); values.push(data.defaultModel ?? null); }

  values.push(id);
  db.prepare(`UPDATE custom_providers SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getCustomProvider(db, id)!;
}

export function softDeleteCustomProvider(db: DatabaseSync, id: string): void {
  db.prepare('UPDATE custom_providers SET deleted = 1, updated_at = ? WHERE id = ?').run(
    Date.now(),
    id,
  );
}
