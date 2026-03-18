import { DatabaseSync } from 'node:sqlite';
import { encryptField, decryptField } from '../../security/fieldEncryption';

/**
 * Encrypt previously-plaintext fields:
 *   - tones.description (builtin + custom; also fixes plaintext seed values)
 *   - messages.metadata (nullable; only rows where metadata IS NOT NULL)
 *   - composition_voices.cli_command (nullable)
 *   - system_prompt_templates.content (fixes plaintext seed values written before MED-003)
 *
 * decryptField passes through values that don't start with ENC:v1:, so the
 * startsWith guard is purely an optimisation to skip already-encrypted rows.
 */
export function up(db: DatabaseSync): void {
  // tones.description
  const toneRows = db.prepare('SELECT id, description FROM tones').all() as {
    id: string;
    description: string;
  }[];
  const updateToneDesc = db.prepare('UPDATE tones SET description = ? WHERE id = ?');
  for (const row of toneRows) {
    if (row.description.startsWith('ENC:v1:')) continue;
    updateToneDesc.run(encryptField(decryptField(row.description) ?? row.description), row.id);
  }

  // messages.metadata (nullable)
  const msgRows = db
    .prepare('SELECT id, metadata FROM messages WHERE metadata IS NOT NULL')
    .all() as { id: string; metadata: string }[];
  const updateMsgMeta = db.prepare('UPDATE messages SET metadata = ? WHERE id = ?');
  for (const row of msgRows) {
    if (row.metadata.startsWith('ENC:v1:')) continue;
    updateMsgMeta.run(encryptField(decryptField(row.metadata) ?? row.metadata), row.id);
  }

  // composition_voices.cli_command (nullable)
  const voiceRows = db
    .prepare('SELECT id, cli_command FROM composition_voices WHERE cli_command IS NOT NULL')
    .all() as { id: string; cli_command: string }[];
  const updateVoiceCmd = db.prepare('UPDATE composition_voices SET cli_command = ? WHERE id = ?');
  for (const row of voiceRows) {
    if (row.cli_command.startsWith('ENC:v1:')) continue;
    updateVoiceCmd.run(encryptField(decryptField(row.cli_command) ?? row.cli_command), row.id);
  }

  // system_prompt_templates.content (fixes plaintext seed rows)
  const templateRows = db
    .prepare('SELECT id, content FROM system_prompt_templates')
    .all() as { id: string; content: string }[];
  const updateTemplateContent = db.prepare(
    'UPDATE system_prompt_templates SET content = ? WHERE id = ?',
  );
  for (const row of templateRows) {
    if (row.content.startsWith('ENC:v1:')) continue;
    updateTemplateContent.run(
      encryptField(decryptField(row.content) ?? row.content),
      row.id,
    );
  }
}
