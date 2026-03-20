import { DatabaseSync } from 'node:sqlite';
import { TONE_PRESETS } from '../../../shared/constants';
import { CREATE_TABLES_SQL, SCHEMA_VERSION } from '../schema';
import { encryptField } from '../encryption';
import { up as migration002 } from './002_add_update_preferences';
import { up as migration003 } from './003_encrypt_conductor_avatar';
import { up as migration004 } from './004_encrypt_tones_metadata_cli_command';
import { up as migration005 } from './005_add_yolo_mode';
import { up as migration006 } from './006_add_update_channel';
import { up as migration007 } from './007_add_session_working_dir';

const SAMPLE_TEMPLATES: Array<[string, string, string]> = [
  [
    'sample-devils-advocate',
    "Devil's Advocate",
    `You are a devil's advocate. Your role is to challenge assumptions, question conclusions, and present the strongest possible counterarguments to whatever is being proposed. You do not necessarily believe the positions you argue — your goal is to stress-test ideas and expose weaknesses so the group can build more robust thinking. Be direct and pointed, not combative.`,
  ],
  [
    'sample-socratic-guide',
    'Socratic Guide',
    `You are a Socratic guide. Rather than providing direct answers, ask probing questions that help the conversation surface its own insights. Challenge assumptions gently, expose gaps in reasoning, and guide the group toward deeper understanding. When you do offer a perspective, frame it as a question or hypothesis rather than a conclusion.`,
  ],
  [
    'sample-creative-brainstormer',
    'Creative Brainstormer',
    `You are a creative brainstormer. Generate bold, unconventional ideas without filtering for feasibility. Quantity and diversity matter more than polish. Build on others' ideas with "yes, and..." energy. Avoid evaluating or critiquing during ideation — your job is to expand the possibility space as wide as possible.`,
  ],
  [
    'sample-pragmatic-implementer',
    'Pragmatic Implementer',
    `You are a pragmatic implementer. Your focus is on what can actually be done. Translate ideas into concrete next steps, surface practical constraints, and flag risks early. When the conversation drifts into the abstract, bring it back to: "What would we actually do, and how?"`,
  ],
  [
    'sample-domain-expert',
    'Domain Expert',
    `You are a domain expert and technical analyst. Provide precise, well-reasoned answers grounded in established knowledge. Cite relevant concepts, patterns, or prior art when applicable. Acknowledge the limits of your knowledge clearly. Prioritize accuracy over speed — if something is uncertain, say so and explain why.`,
  ],
];

export function runMigrations(db: DatabaseSync): void {
  db.exec(CREATE_TABLES_SQL);

  const now = Date.now();

  const tonePresets: Array<[string, string, string, number]> = [
    ['professional', TONE_PRESETS.professional.label, TONE_PRESETS.professional.description, 1],
    ['collaborative', TONE_PRESETS.collaborative.label, TONE_PRESETS.collaborative.description, 2],
    ['concise', TONE_PRESETS.concise.label, TONE_PRESETS.concise.description, 3],
    ['exploratory', TONE_PRESETS.exploratory.label, TONE_PRESETS.exploratory.description, 4],
    ['teaching', TONE_PRESETS.teaching.label, TONE_PRESETS.teaching.description, 5],
  ];

  const insertTone = db.prepare(`
    INSERT OR IGNORE INTO tones (id, name, description, is_builtin, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?, ?)
  `);
  for (const [id, name, description, sortOrder] of tonePresets) {
    insertTone.run(id, name, encryptField(description), sortOrder, now, now);
  }

  const insertTemplate = db.prepare(`
    INSERT OR IGNORE INTO system_prompt_templates (id, name, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const [id, name, content] of SAMPLE_TEMPLATES) {
    insertTemplate.run(id, name, encryptField(content), now, now);
  }

  db.prepare(`
    INSERT OR IGNORE INTO user_profile (id, conductor_name, pronouns, conductor_context, default_tone, conductor_color, conductor_avatar, updated_at)
    VALUES (1, '', '', '', 'collaborative', '', '', ?)
  `).run(now);

  const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as
    | { version: number }
    | undefined;

  const currentVersion = row?.version ?? 0;

  // Only run migrations on existing databases (row === undefined means fresh install;
  // CREATE_TABLES_SQL already includes the latest schema for new databases).
  if (row !== undefined && currentVersion < 2) {
    migration002(db);
  }

  if (row !== undefined && currentVersion < 3) {
    migration003(db);
  }

  if (row !== undefined && currentVersion < 4) {
    migration004(db);
  }

  if (row !== undefined && currentVersion < 5) {
    migration005(db);
  }

  if (row !== undefined && currentVersion < 6) {
    migration006(db);
  }

  if (row !== undefined && currentVersion < 7) {
    migration007(db);
  }

  if (row === undefined) {
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
  } else if (row.version !== SCHEMA_VERSION) {
    db.prepare('UPDATE schema_version SET version = ?').run(SCHEMA_VERSION);
  }
}
