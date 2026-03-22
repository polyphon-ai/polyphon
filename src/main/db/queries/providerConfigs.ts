import type Database from 'better-sqlite3';
import type { ProviderConfig } from '../../../shared/types';

interface ProviderConfigRow {
  id: string;
  provider: string;
  enabled: number;
  voice_type: string;
  default_model: string | null;
  cli_command: string | null;
  cli_args: string | null;
  yolo_mode: number;
  created_at: number;
  updated_at: number;
}

function rowToConfig(row: ProviderConfigRow): ProviderConfig {
  return {
    id: row.id,
    provider: row.provider,
    enabled: row.enabled === 1,
    voiceType: row.voice_type as ProviderConfig['voiceType'],
    defaultModel: row.default_model,
    cliCommand: row.cli_command,
    cliArgs: row.cli_args,
    yoloMode: row.yolo_mode === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listProviderConfigs(db: Database.Database): ProviderConfig[] {
  const rows = db
    .prepare('SELECT * FROM provider_configs ORDER BY provider ASC, voice_type ASC')
    .all() as ProviderConfigRow[];
  return rows.map(rowToConfig);
}

function getProviderConfigByType(
  db: Database.Database,
  provider: string,
  voiceType: string,
): ProviderConfig | null {
  const row = db
    .prepare('SELECT * FROM provider_configs WHERE provider = ? AND voice_type = ?')
    .get(provider, voiceType) as ProviderConfigRow | undefined;
  return row ? rowToConfig(row) : null;
}

export function upsertProviderConfig(
  db: Database.Database,
  config: Omit<ProviderConfig, 'createdAt' | 'updatedAt'>,
): ProviderConfig {
  const now = Date.now();
  db.prepare(`
    INSERT INTO provider_configs (id, provider, enabled, voice_type, default_model, cli_command, cli_args, yolo_mode, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, voice_type) DO UPDATE SET
      enabled = excluded.enabled,
      default_model = excluded.default_model,
      cli_command = excluded.cli_command,
      cli_args = excluded.cli_args,
      yolo_mode = excluded.yolo_mode,
      updated_at = excluded.updated_at
  `).run(
    config.id,
    config.provider,
    config.enabled ? 1 : 0,
    config.voiceType,
    config.defaultModel,
    config.cliCommand,
    config.cliArgs ?? null,
    config.yoloMode ? 1 : 0,
    now,
    now,
  );

  return getProviderConfigByType(db, config.provider, config.voiceType)!;
}
