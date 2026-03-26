import path from 'node:path';
import fs from 'node:fs';
import type Database from 'better-sqlite3';
import type { Session } from '../../../shared/types';
import type { VoiceManager } from '../../managers/VoiceManager';
import { getComposition } from '../../db/queries/compositions';
import { insertSession } from '../../db/queries/sessions';
import { getUserProfile } from '../../db/queries/userProfile';
import { requireId, requireString, MAX_NAME } from '../../ipc/validate';
import { generateId } from '../../utils';
import { logger } from '../../utils/logger';

interface CreateSessionInput {
  compositionId: unknown;
  name?: unknown;
  workingDir?: unknown;
  sandboxedToWorkingDir?: unknown;
}

interface CreateSessionResult {
  session: Session;
}

export function buildCreateSessionTool(db: Database.Database, voiceManager: VoiceManager) {
  return async (input: CreateSessionInput): Promise<CreateSessionResult> => {
    const compositionId = requireId(input.compositionId, 'compositionId');
    const name = input.name != null
      ? requireString(input.name, 'name', MAX_NAME)
      : 'MCP Session';

    // Validate workingDir if provided
    let validWorkingDir: string | null = null;
    if (input.workingDir != null && typeof input.workingDir === 'string' && input.workingDir.trim().length > 0) {
      const dir = input.workingDir.trim();
      if (!path.isAbsolute(dir)) {
        throw new Error(`workingDir must be an absolute path, got: ${dir}`);
      }
      let stat: fs.Stats;
      try {
        stat = fs.statSync(dir);
      } catch {
        throw new Error(`workingDir does not exist: ${dir}`);
      }
      if (!stat.isDirectory()) {
        throw new Error(`workingDir is not a directory: ${dir}`);
      }
      validWorkingDir = dir;
    }

    const sandboxed = validWorkingDir !== null && input.sandboxedToWorkingDir === true;

    const composition = getComposition(db, compositionId);
    if (!composition) throw new Error(`Composition not found: ${compositionId}`);

    const voices = composition.voices.map((cv) => voiceManager.createVoice(cv));
    const now = Date.now();
    const session: Session = {
      id: generateId(),
      compositionId,
      name,
      mode: composition.mode,
      continuationPolicy: composition.continuationPolicy,
      continuationMaxRounds: composition.continuationMaxRounds,
      createdAt: now,
      updatedAt: now,
      archived: false,
      workingDir: validWorkingDir,
      sandboxedToWorkingDir: sandboxed,
      source: 'mcp',
    };

    const profile = getUserProfile(db);
    voiceManager.initSession(session.id, voices, session.mode, profile, validWorkingDir, sandboxed);
    insertSession(db, session);
    logger.debug('[mcp] createSession', { sessionId: session.id, compositionId, mode: session.mode, voiceCount: voices.length });
    return { session };
  };
}
