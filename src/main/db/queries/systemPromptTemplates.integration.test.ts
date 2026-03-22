import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrations';
import {
  listSystemPromptTemplates,
  getSystemPromptTemplate,
  createSystemPromptTemplate,
  updateSystemPromptTemplate,
  deleteSystemPromptTemplate,
} from './systemPromptTemplates';
import { insertComposition, getComposition } from './compositions';
import type { Composition, CompositionVoice } from '../../../shared/types';


function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  runMigrations(db);
  return db;
}

function makeCompositionWithTemplate(templateId: string): Composition {
  return {
    id: `comp-${templateId}`,
    name: 'Test',
    mode: 'broadcast',
    continuationPolicy: 'none',
    continuationMaxRounds: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    archived: false,
    voices: [
      {
        id: `v-${templateId}`,
        compositionId: `comp-${templateId}`,
        provider: 'anthropic',
        displayName: 'Test Voice',
        systemPrompt: 'Snapshot content',
        systemPromptTemplateId: templateId,
        order: 0,
        color: '#000',
        avatarIcon: 'anthropic',
      } as CompositionVoice,
    ],
  };
}

describe('systemPromptTemplates queries', () => {
  let db: Database.Database;

  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('starts with seeded sample templates', () => {
    const list = listSystemPromptTemplates(db);
    expect(list.length).toBeGreaterThanOrEqual(5);
    const names = list.map((t) => t.name);
    expect(names).toContain("Devil's Advocate");
    expect(names).toContain('Socratic Guide');
    expect(names).toContain('Creative Brainstormer');
    expect(names).toContain('Pragmatic Implementer');
    expect(names).toContain('Domain Expert');
  });

  it('creates and retrieves a template', () => {
    const t = createSystemPromptTemplate(db, { name: 'Code Review', content: 'Review code carefully.' });
    expect(t.id).toBeTruthy();
    expect(t.name).toBe('Code Review');
    expect(t.content).toBe('Review code carefully.');
    expect(t.createdAt).toBeGreaterThan(0);
  });

  it('lists templates ordered by creation time', () => {
    const before = listSystemPromptTemplates(db).length;
    createSystemPromptTemplate(db, { name: 'A', content: 'Alpha' });
    createSystemPromptTemplate(db, { name: 'B', content: 'Beta' });
    const list = listSystemPromptTemplates(db);
    expect(list).toHaveLength(before + 2);
    expect(list[before]!.name).toBe('A');
    expect(list[before + 1]!.name).toBe('B');
  });

  it('returns null for unknown id', () => {
    expect(getSystemPromptTemplate(db, 'nonexistent')).toBeNull();
  });

  it('updates name and content', () => {
    const t = createSystemPromptTemplate(db, { name: 'Original', content: 'Old content.' });
    const updated = updateSystemPromptTemplate(db, t.id, { name: 'Renamed', content: 'New content.' });
    expect(updated.name).toBe('Renamed');
    expect(updated.content).toBe('New content.');
  });

  it('deletes a template', () => {
    const t = createSystemPromptTemplate(db, { name: 'Temp', content: 'Content.' });
    deleteSystemPromptTemplate(db, t.id);
    expect(getSystemPromptTemplate(db, t.id)).toBeNull();
  });

  it('deleteSystemPromptTemplate clears system_prompt_template_id on referencing voices', () => {
    const t = createSystemPromptTemplate(db, { name: 'Temp', content: 'Content.' });
    insertComposition(db, makeCompositionWithTemplate(t.id));

    const before = db
      .prepare('SELECT system_prompt_template_id FROM composition_voices WHERE system_prompt_template_id = ?')
      .all(t.id) as unknown[];
    expect(before).toHaveLength(1);

    deleteSystemPromptTemplate(db, t.id);

    const after = db
      .prepare('SELECT system_prompt_template_id FROM composition_voices WHERE system_prompt_template_id = ?')
      .all(t.id) as unknown[];
    expect(after).toHaveLength(0);
  });

  it('deleteSystemPromptTemplate preserves inline system_prompt snapshot', () => {
    const t = createSystemPromptTemplate(db, { name: 'Temp', content: 'Content.' });
    insertComposition(db, makeCompositionWithTemplate(t.id));
    deleteSystemPromptTemplate(db, t.id);

    const comp = getComposition(db, `comp-${t.id}`);
    expect(comp!.voices[0]!.systemPrompt).toBe('Snapshot content');
  });

  it('allows duplicate names (no uniqueness constraint on templates)', () => {
    createSystemPromptTemplate(db, { name: 'Same', content: 'Content A.' });
    expect(() => createSystemPromptTemplate(db, { name: 'Same', content: 'Content B.' })).not.toThrow();
  });

  it('decrypts content back to original value', () => {
    const t = createSystemPromptTemplate(db, { name: 'Secret', content: 'Secret content' });
    const retrieved = getSystemPromptTemplate(db, t.id);
    expect(retrieved!.content).toBe('Secret content');
  });

  it('reads legacy plaintext content without error', () => {
    const id = 'legacy-spt';
    db.prepare('INSERT INTO system_prompt_templates (id, name, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, 'Legacy', 'Legacy plaintext content', Date.now(), Date.now());
    const t = getSystemPromptTemplate(db, id);
    expect(t!.content).toBe('Legacy plaintext content');
  });
});
