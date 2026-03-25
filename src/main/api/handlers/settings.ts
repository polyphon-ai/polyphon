import type Database from 'better-sqlite3';
import type { HandlerFn } from '../dispatcher';
import { getProviderStatus, testCliVoice } from '../../ipc/settingsHandlers';
import { SCHEMA_VERSION } from '../../db/schema';
import { PROVIDER_METADATA, SETTINGS_PROVIDERS } from '../../../shared/constants';
import { getUserProfile } from '../../db/queries/userProfile';
import { app } from 'electron';
import os from 'node:os';

export function buildSettingsHandlers(db: Database.Database): Record<string, HandlerFn> {
  return {
    'settings.getProviderStatus': async () => {
      const apiStatuses = getProviderStatus();
      return apiStatuses.map((s) => {
        const meta = PROVIDER_METADATA[s.provider];
        const cliCommand = meta?.defaultCliCommand ?? null;
        let cliStatus: { available: boolean; path?: string; command?: string; error?: string } | null = null;
        if (cliCommand && meta?.supportedTypes.includes('cli')) {
          const result = testCliVoice(cliCommand);
          cliStatus = {
            available: result.success,
            command: cliCommand,
            ...(result.path ? { path: result.path } : {}),
            ...(result.error ? { error: result.error } : {}),
          };
        }
        return { ...s, cliStatus };
      });
    },

    'settings.getDebugInfo': async () => {
      return {
        appVersion: app.getVersion(),
        schemaVersion: SCHEMA_VERSION,
        platform: os.platform(),
        arch: os.arch(),
      };
    },

    'settings.getUserProfile': async () => {
      const profile = getUserProfile(db);
      return {
        conductorName: profile.conductorName,
        conductorColor: profile.conductorColor,
        conductorAvatar: profile.conductorAvatar,
        pronouns: profile.pronouns,
      };
    },
  };
}
