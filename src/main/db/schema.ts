export const SCHEMA_VERSION = 5;

export const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS compositions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mode TEXT NOT NULL CHECK(mode IN ('conductor', 'broadcast')),
    continuation_policy TEXT NOT NULL CHECK(continuation_policy IN ('none', 'prompt', 'auto')),
    continuation_max_rounds INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS composition_voices (
    id TEXT PRIMARY KEY,
    composition_id TEXT NOT NULL REFERENCES compositions(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    model TEXT,
    cli_command TEXT,
    cli_args TEXT,          -- JSON-serialized string[]
    display_name TEXT NOT NULL,
    system_prompt TEXT,
    sort_order INTEGER NOT NULL,
    color TEXT NOT NULL,
    avatar_icon TEXT NOT NULL,
    custom_provider_id TEXT,  -- NULL for built-in providers; UUID for 'openai-compat' voices
    tone_override TEXT,       -- NULL means use conductor default_tone
    system_prompt_template_id TEXT  -- NULL means use inline system_prompt
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    composition_id TEXT NOT NULL,
    name TEXT NOT NULL,
    mode TEXT NOT NULL CHECK(mode IN ('conductor', 'broadcast')),
    continuation_policy TEXT NOT NULL CHECK(continuation_policy IN ('none', 'prompt', 'auto')),
    continuation_max_rounds INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('conductor', 'voice', 'system')),
    voice_id TEXT,
    voice_name TEXT,
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    round_index INTEGER NOT NULL,
    metadata TEXT            -- JSON-serialized Record<string, unknown>
  );

  CREATE TABLE IF NOT EXISTS provider_configs (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    voice_type TEXT NOT NULL CHECK(voice_type IN ('api', 'cli')) DEFAULT 'api',
    default_model TEXT,
    cli_command TEXT,
    cli_args TEXT,
    yolo_mode INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(provider, voice_type)
  );

  CREATE TABLE IF NOT EXISTS custom_providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    base_url TEXT NOT NULL,
    api_key_env_var TEXT,
    default_model TEXT,
    deleted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tones (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    is_builtin INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS system_prompt_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_profile (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    conductor_name TEXT NOT NULL DEFAULT '',
    pronouns TEXT NOT NULL DEFAULT '',
    conductor_context TEXT NOT NULL DEFAULT '',
    default_tone TEXT NOT NULL DEFAULT 'collaborative',
    conductor_color TEXT NOT NULL DEFAULT '',
    conductor_avatar TEXT NOT NULL DEFAULT '',
    dismissed_update_version TEXT NOT NULL DEFAULT '',
    update_remind_after INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );

`;
