import { DatabaseSync } from 'node:sqlite';
import type { UserProfile, TonePreset } from '../../../shared/types';
import { encryptField, decryptField, type EncryptedField } from '../encryption';

interface UserProfileRow {
  id: number;
  conductor_name: EncryptedField;
  pronouns: EncryptedField;
  conductor_context: EncryptedField;
  default_tone: string;
  conductor_color: string;
  conductor_avatar: string;
  dismissed_update_version: string;
  update_remind_after: number;
  updated_at: number;
}

function rowToProfile(row: UserProfileRow): UserProfile {
  return {
    conductorName: decryptField(row.conductor_name) ?? '',
    pronouns: decryptField(row.pronouns) ?? '',
    conductorContext: decryptField(row.conductor_context) ?? '',
    defaultTone: row.default_tone as TonePreset,
    conductorColor: row.conductor_color,
    conductorAvatar: row.conductor_avatar,
    updatedAt: row.updated_at,
  };
}

export function getUserProfile(db: DatabaseSync): UserProfile {
  const row = db
    .prepare('SELECT * FROM user_profile WHERE id = 1')
    .get() as UserProfileRow | undefined;

  if (!row) {
    return { conductorName: '', pronouns: '', conductorContext: '', defaultTone: 'collaborative', conductorColor: '', conductorAvatar: '', updatedAt: 0 };
  }

  return rowToProfile(row);
}

export function upsertUserProfile(
  db: DatabaseSync,
  profile: Omit<UserProfile, 'updatedAt'>,
): UserProfile {
  const now = Date.now();
  db.prepare(`
    UPDATE user_profile SET conductor_name=?, pronouns=?, conductor_context=?, default_tone=?, conductor_color=?, conductor_avatar=?, updated_at=? WHERE id=1
  `).run(encryptField(profile.conductorName), encryptField(profile.pronouns), encryptField(profile.conductorContext), profile.defaultTone, profile.conductorColor, profile.conductorAvatar, now);

  return getUserProfile(db);
}

export interface UpdatePreferences {
  dismissedUpdateVersion: string;
  updateRemindAfter: number;
}

export function getUpdatePreferences(db: DatabaseSync): UpdatePreferences {
  const row = db
    .prepare('SELECT dismissed_update_version, update_remind_after FROM user_profile WHERE id = 1')
    .get() as { dismissed_update_version: string; update_remind_after: number } | undefined;

  return {
    dismissedUpdateVersion: row?.dismissed_update_version ?? '',
    updateRemindAfter: row?.update_remind_after ?? 0,
  };
}

export function setDismissedUpdateVersion(db: DatabaseSync, version: string): void {
  db.prepare('UPDATE user_profile SET dismissed_update_version = ? WHERE id = 1').run(version);
}

export function setUpdateRemindAfter(db: DatabaseSync, remindAfter: number): void {
  db.prepare('UPDATE user_profile SET update_remind_after = ? WHERE id = 1').run(remindAfter);
}
