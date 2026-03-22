import type Database from 'better-sqlite3';
import type { UserProfile, TonePreset, UpdateChannel } from '../../../shared/types';

interface UserProfileRow {
  id: number;
  conductor_name: string;
  pronouns: string;
  conductor_context: string;
  default_tone: string;
  conductor_color: string;
  conductor_avatar: string;
  dismissed_update_version: string;
  update_remind_after: number;
  prefer_markdown: number;
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
    preferMarkdown: row.prefer_markdown !== 0,
    updatedAt: row.updated_at,
  };
}

export function getUserProfile(db: Database.Database): UserProfile {
  const row = db
    .prepare('SELECT * FROM user_profile WHERE id = 1')
    .get() as UserProfileRow | undefined;

  if (!row) {
    return { conductorName: '', pronouns: '', conductorContext: '', defaultTone: 'collaborative', conductorColor: '', conductorAvatar: '', preferMarkdown: true, updatedAt: 0 };
  }

  return rowToProfile(row);
}

export function upsertUserProfile(
  db: Database.Database,
  profile: Omit<UserProfile, 'updatedAt'>,
): UserProfile {
  const now = Date.now();
  db.prepare(`
    UPDATE user_profile SET conductor_name=?, pronouns=?, conductor_context=?, default_tone=?, conductor_color=?, conductor_avatar=?, prefer_markdown=?, updated_at=? WHERE id=1
  `).run(profile.conductorName, profile.pronouns, profile.conductorContext, profile.defaultTone, profile.conductorColor, profile.conductorAvatar, profile.preferMarkdown ? 1 : 0, now);

  return getUserProfile(db);
}

export interface UpdatePreferences {
  dismissedUpdateVersion: string;
  updateRemindAfter: number;
}

export function getUpdatePreferences(db: Database.Database): UpdatePreferences {
  const row = db
    .prepare('SELECT dismissed_update_version, update_remind_after FROM user_profile WHERE id = 1')
    .get() as { dismissed_update_version: string; update_remind_after: number } | undefined;

  return {
    dismissedUpdateVersion: row?.dismissed_update_version ?? '',
    updateRemindAfter: row?.update_remind_after ?? 0,
  };
}

export function setDismissedUpdateVersion(db: Database.Database, version: string): void {
  db.prepare('UPDATE user_profile SET dismissed_update_version = ? WHERE id = 1').run(version);
}

export function setUpdateRemindAfter(db: Database.Database, remindAfter: number): void {
  db.prepare('UPDATE user_profile SET update_remind_after = ? WHERE id = 1').run(remindAfter);
}

export function getUpdateChannel(db: Database.Database): UpdateChannel {
  const row = db
    .prepare('SELECT update_channel FROM user_profile WHERE id = 1')
    .get() as { update_channel: string } | undefined;
  return row?.update_channel === 'preview' ? 'preview' : 'stable';
}

export function setUpdateChannel(db: Database.Database, channel: UpdateChannel): void {
  db.prepare('UPDATE user_profile SET update_channel = ? WHERE id = 1').run(channel);
}
