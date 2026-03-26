import type Database from 'better-sqlite3';
import type { Composition, CompositionVoice } from '../../../shared/types';

interface CompositionRow {
  id: string;
  name: string;
  mode: string;
  continuation_policy: string;
  continuation_max_rounds: number;
  created_at: number;
  updated_at: number;
  archived: number;
}

interface CompositionVoiceRow {
  id: string;
  composition_id: string;
  provider: string;
  model: string | null;
  cli_command: string | null;
  cli_args: string | null;
  display_name: string;
  system_prompt: string | null;
  sort_order: number;
  color: string;
  avatar_icon: string;
  custom_provider_id: string | null;
  tone_override: string | null;
  system_prompt_template_id: string | null;
  enabled_tools: string;
  yolo_mode_override: number | null;
}

function rowToCompositionVoice(row: CompositionVoiceRow): CompositionVoice {
  return {
    id: row.id,
    compositionId: row.composition_id,
    provider: row.provider,
    model: row.model ?? undefined,
    cliCommand: row.cli_command ?? undefined,
    cliArgs: row.cli_args ? (JSON.parse(row.cli_args) as string[]) : undefined,
    displayName: row.display_name,
    systemPrompt: row.system_prompt ?? undefined,
    toneOverride: row.tone_override ?? undefined,
    systemPromptTemplateId: row.system_prompt_template_id ?? undefined,
    order: row.sort_order,
    color: row.color,
    avatarIcon: row.avatar_icon,
    customProviderId: row.custom_provider_id ?? undefined,
    enabledTools: JSON.parse(row.enabled_tools ?? '[]') as string[],
    yoleModeOverride: row.yolo_mode_override === null ? null : row.yolo_mode_override === 1,
  };
}

function rowToComposition(row: CompositionRow, voices: CompositionVoiceRow[]): Composition {
  return {
    id: row.id,
    name: row.name,
    mode: row.mode as Composition['mode'],
    continuationPolicy: row.continuation_policy as Composition['continuationPolicy'],
    continuationMaxRounds: row.continuation_max_rounds,
    voices: voices.map(rowToCompositionVoice).sort((a, b) => a.order - b.order),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archived: row.archived === 1,
  };
}

export function listCompositions(db: Database.Database, archived = false): Composition[] {
  const comps = db
    .prepare('SELECT * FROM compositions WHERE archived = ? ORDER BY created_at DESC')
    .all(archived ? 1 : 0) as CompositionRow[];
  if (comps.length === 0) return [];

  const allVoices = db
    .prepare('SELECT * FROM composition_voices')
    .all() as CompositionVoiceRow[];

  const voicesByComp = new Map<string, CompositionVoiceRow[]>();
  for (const v of allVoices) {
    const list = voicesByComp.get(v.composition_id) ?? [];
    list.push(v);
    voicesByComp.set(v.composition_id, list);
  }

  return comps.map((comp) => rowToComposition(comp, voicesByComp.get(comp.id) ?? []));
}

export function getComposition(db: Database.Database, id: string): Composition | null {
  const comp = db
    .prepare('SELECT * FROM compositions WHERE id = ?')
    .get(id) as CompositionRow | undefined;
  if (!comp) return null;

  const voices = db
    .prepare('SELECT * FROM composition_voices WHERE composition_id = ? ORDER BY sort_order ASC')
    .all(id) as CompositionVoiceRow[];

  return rowToComposition(comp, voices);
}

const INSERT_VOICE_SQL = `
  INSERT INTO composition_voices (id, composition_id, provider, model, cli_command, cli_args, display_name, system_prompt, sort_order, color, avatar_icon, custom_provider_id, tone_override, system_prompt_template_id, enabled_tools, yolo_mode_override)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

function runInsertVoice(stmt: Database.Statement, voice: CompositionVoice): void {
  stmt.run(
    voice.id,
    voice.compositionId,
    voice.provider,
    voice.model ?? null,
    voice.cliCommand ?? null,
    voice.cliArgs ? JSON.stringify(voice.cliArgs) : null,
    voice.displayName,
    voice.systemPrompt ?? null,
    voice.order,
    voice.color,
    voice.avatarIcon,
    voice.customProviderId ?? null,
    voice.toneOverride ?? null,
    voice.systemPromptTemplateId ?? null,
    JSON.stringify(voice.enabledTools ?? []),
    voice.yoleModeOverride === undefined ? null : (voice.yoleModeOverride === null ? null : (voice.yoleModeOverride ? 1 : 0)),
  );
}

export function insertComposition(db: Database.Database, composition: Composition): void {
  const insertComp = db.prepare(`
    INSERT INTO compositions (id, name, mode, continuation_policy, continuation_max_rounds, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertVoice = db.prepare(INSERT_VOICE_SQL);

  db.exec('BEGIN');
  try {
    insertComp.run(
      composition.id,
      composition.name,
      composition.mode,
      composition.continuationPolicy,
      composition.continuationMaxRounds,
      composition.createdAt,
      composition.updatedAt,
    );
    for (const voice of composition.voices) {
      runInsertVoice(insertVoice, voice);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function updateComposition(
  db: Database.Database,
  id: string,
  data: Partial<Pick<Composition, 'name' | 'mode' | 'continuationPolicy' | 'continuationMaxRounds'>>,
): void {
  const updates: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) {
    updates.push('name = ?');
    values.push(data.name);
  }
  if (data.mode !== undefined) {
    updates.push('mode = ?');
    values.push(data.mode);
  }
  if (data.continuationPolicy !== undefined) {
    updates.push('continuation_policy = ?');
    values.push(data.continuationPolicy);
  }
  if (data.continuationMaxRounds !== undefined) {
    updates.push('continuation_max_rounds = ?');
    values.push(data.continuationMaxRounds);
  }

  if (updates.length === 0) return;

  updates.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);

  db.prepare(`UPDATE compositions SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteComposition(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM compositions WHERE id = ?').run(id);
}

export function archiveComposition(db: Database.Database, id: string, archived: boolean): void {
  db.prepare('UPDATE compositions SET archived = ?, updated_at = ? WHERE id = ?').run(
    archived ? 1 : 0,
    Date.now(),
    id,
  );
}

export function upsertCompositionVoices(db: Database.Database, voices: CompositionVoice[]): void {
  if (voices.length === 0) return;

  const compositionId = voices[0]!.compositionId;
  const deleteVoices = db.prepare('DELETE FROM composition_voices WHERE composition_id = ?');
  const insertVoice = db.prepare(INSERT_VOICE_SQL);

  db.exec('BEGIN');
  try {
    deleteVoices.run(compositionId);
    for (const voice of voices) {
      runInsertVoice(insertVoice, voice);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
