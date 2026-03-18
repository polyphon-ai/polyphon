/**
 * Manifest test — CI gate that asserts every field in ENCRYPTED_FIELDS is stored as
 * ciphertext (ENC:v1:…) and never as plaintext when written through the query layer.
 *
 * If this test fails, a field is being written unencrypted. Add or fix the corresponding
 * encryptField() call in the relevant query file.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './migrations';
import { initFieldEncryption, _resetForTests } from '../security/fieldEncryption';
import { insertMessage, listMessages } from './queries/messages';
import { upsertUserProfile, getUserProfile } from './queries/userProfile';
import { createCustomProvider, getCustomProvider } from './queries/customProviders';
import { createSystemPromptTemplate, getSystemPromptTemplate } from './queries/systemPromptTemplates';
import { insertComposition, getComposition } from './queries/compositions';
import { insertSession } from './queries/sessions';
import type { Message, Session, Composition, CompositionVoice } from '../../shared/types';

const TEST_KEY = Buffer.alloc(32);
const SENTINEL = 'SENTINEL_PLAINTEXT_MUST_NOT_APPEAR';

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  runMigrations(db);
  return db;
}

describe('Encryption manifest — all encrypted fields are stored as ciphertext', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    initFieldEncryption(TEST_KEY);
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
    _resetForTests();
  });

  it('messages.content is stored as ENC:v1:…', () => {
    const session: Session = { id: 's1', compositionId: 'c1', name: 'S', mode: 'broadcast', continuationPolicy: 'none', continuationMaxRounds: 1, createdAt: 0, updatedAt: 0, archived: false };
    insertSession(db, session);
    const msg: Message = { id: 'm1', sessionId: 's1', role: 'conductor', voiceId: null, voiceName: null, content: SENTINEL, timestamp: 0, roundIndex: 0 };
    insertMessage(db, msg);
    const row = db.prepare('SELECT content FROM messages WHERE id = ?').get('m1') as { content: string };
    expect(row.content).toMatch(/^ENC:v1:/);
    expect(row.content).not.toContain(SENTINEL);
    // Round-trip: query layer must decrypt back to the original value
    const messages = listMessages(db, 's1');
    expect(messages.find((m) => m.id === 'm1')!.content).toBe(SENTINEL);
  });

  it('user_profile.conductor_name, pronouns, conductor_context, conductor_avatar are stored as ENC:v1:…', () => {
    upsertUserProfile(db, { conductorName: SENTINEL, pronouns: SENTINEL, conductorContext: SENTINEL, defaultTone: 'collaborative', conductorColor: '', conductorAvatar: SENTINEL });
    const row = db.prepare('SELECT conductor_name, pronouns, conductor_context, conductor_avatar FROM user_profile WHERE id = 1').get() as { conductor_name: string; pronouns: string; conductor_context: string; conductor_avatar: string };
    expect(row.conductor_name).toMatch(/^ENC:v1:/);
    expect(row.conductor_name).not.toContain(SENTINEL);
    expect(row.pronouns).toMatch(/^ENC:v1:/);
    expect(row.conductor_context).toMatch(/^ENC:v1:/);
    expect(row.conductor_avatar).toMatch(/^ENC:v1:/);
    expect(row.conductor_avatar).not.toContain(SENTINEL);
    // Round-trip: query layer must decrypt back to the original values
    const profile = getUserProfile(db);
    expect(profile.conductorName).toBe(SENTINEL);
    expect(profile.pronouns).toBe(SENTINEL);
    expect(profile.conductorContext).toBe(SENTINEL);
    expect(profile.conductorAvatar).toBe(SENTINEL);
  });

  it('custom_providers.base_url is stored as ENC:v1:…', () => {
    const cp = createCustomProvider(db, { name: 'Test', slug: 'test', baseUrl: SENTINEL, apiKeyEnvVar: null, defaultModel: null });
    const row = db.prepare('SELECT base_url FROM custom_providers WHERE id = ?').get(cp.id) as { base_url: string };
    expect(row.base_url).toMatch(/^ENC:v1:/);
    expect(row.base_url).not.toContain(SENTINEL);
    // Round-trip: query layer must decrypt back to the original value
    expect(getCustomProvider(db, cp.id)!.baseUrl).toBe(SENTINEL);
  });

  it('system_prompt_templates.content is stored as ENC:v1:…', () => {
    const t = createSystemPromptTemplate(db, { name: 'T', content: SENTINEL });
    const row = db.prepare('SELECT content FROM system_prompt_templates WHERE id = ?').get(t.id) as { content: string };
    expect(row.content).toMatch(/^ENC:v1:/);
    expect(row.content).not.toContain(SENTINEL);
    // Round-trip: query layer must decrypt back to the original value
    expect(getSystemPromptTemplate(db, t.id)!.content).toBe(SENTINEL);
  });

  it('composition_voices.system_prompt and cli_args are stored as ENC:v1:…', () => {
    const voice: CompositionVoice = { id: 'v1', compositionId: 'comp1', provider: 'anthropic', model: 'claude-opus-4-6', displayName: 'Alice', systemPrompt: SENTINEL, cliArgs: [SENTINEL], order: 0, color: '#000', avatarIcon: 'star' };
    const comp: Composition = { id: 'comp1', name: 'C', mode: 'broadcast', continuationPolicy: 'none', continuationMaxRounds: 1, voices: [voice], createdAt: 0, updatedAt: 0, archived: false };
    insertComposition(db, comp);
    const row = db.prepare('SELECT system_prompt, cli_args FROM composition_voices WHERE id = ?').get('v1') as { system_prompt: string; cli_args: string };
    expect(row.system_prompt).toMatch(/^ENC:v1:/);
    expect(row.system_prompt).not.toContain(SENTINEL);
    expect(row.cli_args).toMatch(/^ENC:v1:/);
    expect(row.cli_args).not.toContain(SENTINEL);
    // Round-trip: query layer must decrypt back to the original values
    const retrieved = getComposition(db, 'comp1');
    expect(retrieved!.voices[0]!.systemPrompt).toBe(SENTINEL);
    expect(retrieved!.voices[0]!.cliArgs).toEqual([SENTINEL]);
  });
});
