import type Database from 'better-sqlite3';
import type { Session } from '../../shared/types';
import type { VoiceManager } from '../managers/VoiceManager';
import { getComposition } from '../db/queries/compositions';
import { getUserProfile } from '../db/queries/userProfile';
import { logger } from '../utils/logger';

// Ensures the in-memory voice ensemble for a session is initialized.
// Called by MCP tool handlers before running rounds. Safe to call multiple times —
// skips re-initialization if the ensemble is already in memory.
export async function ensureSessionInitialized(
  db: Database.Database,
  voiceManager: VoiceManager,
  session: Session,
): Promise<void> {
  const existing = voiceManager.getEnsemble(session.id);
  if (existing.length > 0) return;

  const composition = getComposition(db, session.compositionId);
  if (!composition || composition.voices.length === 0) {
    logger.warn('[mcp] ensureSessionInitialized: composition not found or has no voices', {
      sessionId: session.id,
      compositionId: session.compositionId,
    });
    return;
  }

  const voices = composition.voices.map((cv) => voiceManager.createVoice(cv));
  const profile = getUserProfile(db);
  voiceManager.initSession(
    session.id,
    voices,
    session.mode,
    profile,
    session.workingDir,
    session.sandboxedToWorkingDir,
  );
  logger.debug('[mcp] ensureSessionInitialized: session rehydrated from DB', {
    sessionId: session.id,
    voiceCount: voices.length,
  });
}
