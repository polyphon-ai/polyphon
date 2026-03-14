import { DatabaseSync } from 'node:sqlite';
import type { UserProfile, TonePreset } from '../../../shared/types';

interface UserProfileRow {
  id: number;
  conductor_name: string;
  pronouns: string;
  conductor_context: string;
  default_tone: string;
  conductor_color: string;
  conductor_avatar: string;
  updated_at: number;
}

function rowToProfile(row: UserProfileRow): UserProfile {
  return {
    conductorName: row.conductor_name,
    pronouns: row.pronouns,
    conductorContext: row.conductor_context,
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
    INSERT OR REPLACE INTO user_profile (id, conductor_name, pronouns, conductor_context, default_tone, conductor_color, conductor_avatar, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?)
  `).run(profile.conductorName, profile.pronouns, profile.conductorContext, profile.defaultTone, profile.conductorColor, profile.conductorAvatar, now);

  return getUserProfile(db);
}
