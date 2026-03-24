import type { HandlerFn } from '../dispatcher';
import { getProviderStatus } from '../../ipc/settingsHandlers';
import { SCHEMA_VERSION } from '../../db/schema';
import { app } from 'electron';
import os from 'node:os';

export function buildSettingsHandlers(): Record<string, HandlerFn> {
  return {
    'settings.getProviderStatus': async () => {
      return getProviderStatus();
    },

    'settings.getDebugInfo': async () => {
      return {
        appVersion: app.getVersion(),
        schemaVersion: SCHEMA_VERSION,
        platform: os.platform(),
        arch: os.arch(),
      };
    },
  };
}
