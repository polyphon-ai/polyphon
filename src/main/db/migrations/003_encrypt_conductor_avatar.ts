import { DatabaseSync } from 'node:sqlite';
import { encryptField, decryptField } from '../../security/fieldEncryption';

// Encrypt any plaintext conductor_avatar values written before the MED-002 fix.
// decryptField is a no-op for values that already start with ENC:v1: so this
// migration is safe to run against both fresh and already-partially-encrypted rows.
export function up(db: DatabaseSync): void {
  const row = db
    .prepare('SELECT conductor_avatar FROM user_profile WHERE id = 1')
    .get() as { conductor_avatar: string } | undefined;

  if (!row) return;

  const current = row.conductor_avatar;
  // Already encrypted — nothing to do.
  if (current.startsWith('ENC:v1:')) return;

  // Decrypt in case decryptField's passthrough returned plaintext, then re-encrypt.
  const plaintext = decryptField(current as string) ?? '';
  db.prepare('UPDATE user_profile SET conductor_avatar = ? WHERE id = 1')
    .run(encryptField(plaintext));
}
