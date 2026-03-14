import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../migrations';
import {
  listCustomProviders,
  getCustomProvider,
  createCustomProvider,
  updateCustomProvider,
  softDeleteCustomProvider,
} from './customProviders';

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  runMigrations(db);
  return db;
}

describe('customProviders queries', () => {
  let db: DatabaseSync;

  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('creates and retrieves a custom provider', () => {
    const cp = createCustomProvider(db, {
      name: 'Ollama',
      slug: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      apiKeyEnvVar: null,
      defaultModel: 'llama3.2',
    });

    expect(cp.id).toBeTruthy();
    expect(cp.name).toBe('Ollama');
    expect(cp.slug).toBe('ollama');
    expect(cp.baseUrl).toBe('http://localhost:11434/v1');
    expect(cp.apiKeyEnvVar).toBeNull();
    expect(cp.defaultModel).toBe('llama3.2');
    expect(cp.deleted).toBe(false);
    expect(cp.createdAt).toBeGreaterThan(0);
  });

  it('lists non-deleted custom providers', () => {
    createCustomProvider(db, { name: 'A', slug: 'a', baseUrl: 'http://a.test/v1', apiKeyEnvVar: null, defaultModel: null });
    createCustomProvider(db, { name: 'B', slug: 'b', baseUrl: 'http://b.test/v1', apiKeyEnvVar: null, defaultModel: null });

    const providers = listCustomProviders(db);
    expect(providers).toHaveLength(2);
    expect(providers.map((p) => p.slug)).toContain('a');
    expect(providers.map((p) => p.slug)).toContain('b');
  });

  it('excludes deleted providers from list', () => {
    const cp = createCustomProvider(db, { name: 'A', slug: 'a', baseUrl: 'http://a.test/v1', apiKeyEnvVar: null, defaultModel: null });
    createCustomProvider(db, { name: 'B', slug: 'b', baseUrl: 'http://b.test/v1', apiKeyEnvVar: null, defaultModel: null });

    softDeleteCustomProvider(db, cp.id);

    const providers = listCustomProviders(db);
    expect(providers).toHaveLength(1);
    expect(providers[0]!.slug).toBe('b');
  });

  it('updates name, baseUrl, apiKeyEnvVar, defaultModel', () => {
    const cp = createCustomProvider(db, {
      name: 'LM Studio',
      slug: 'lm-studio',
      baseUrl: 'http://localhost:1234/v1',
      apiKeyEnvVar: 'LM_KEY',
      defaultModel: null,
    });

    const updated = updateCustomProvider(db, cp.id, {
      name: 'LM Studio (updated)',
      baseUrl: 'http://localhost:5678/v1',
      apiKeyEnvVar: null,
      defaultModel: 'mistral',
    });

    expect(updated.name).toBe('LM Studio (updated)');
    expect(updated.baseUrl).toBe('http://localhost:5678/v1');
    expect(updated.apiKeyEnvVar).toBeNull();
    expect(updated.defaultModel).toBe('mistral');
    expect(updated.slug).toBe('lm-studio'); // slug unchanged
  });

  it('soft-deletes: getCustomProvider still returns the row', () => {
    const cp = createCustomProvider(db, { name: 'A', slug: 'a', baseUrl: 'http://a.test/v1', apiKeyEnvVar: null, defaultModel: null });
    softDeleteCustomProvider(db, cp.id);

    const retrieved = getCustomProvider(db, cp.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.deleted).toBe(true);
  });

  it('rejects duplicate slugs with UNIQUE constraint', () => {
    createCustomProvider(db, { name: 'A', slug: 'same-slug', baseUrl: 'http://a.test/v1', apiKeyEnvVar: null, defaultModel: null });
    expect(() =>
      createCustomProvider(db, { name: 'B', slug: 'same-slug', baseUrl: 'http://b.test/v1', apiKeyEnvVar: null, defaultModel: null }),
    ).toThrow();
  });

  it('returns null for unknown id', () => {
    expect(getCustomProvider(db, 'nonexistent-id')).toBeNull();
  });

  it('stores apiKeyEnvVar when provided', () => {
    const cp = createCustomProvider(db, {
      name: 'Proxy',
      slug: 'proxy',
      baseUrl: 'https://proxy.corp/v1',
      apiKeyEnvVar: 'CORP_PROXY_KEY',
      defaultModel: 'gpt-4o',
    });

    expect(cp.apiKeyEnvVar).toBe('CORP_PROXY_KEY');
  });
});
