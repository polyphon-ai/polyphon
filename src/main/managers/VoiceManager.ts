import { DatabaseSync } from 'node:sqlite';
import type { Voice, VoiceConfig, VoiceProviderRegistration } from '../voices/Voice';
import type { CompositionVoice, CustomProvider, ProviderConfig, UserProfile, ToneDefinition, SystemPromptTemplate } from '../../shared/types';
import { PROVIDER_METADATA, PROVIDER_NAMES } from '../../shared/constants';
import { anthropicProvider } from '../voices/providers/anthropic';
import { openaiProvider } from '../voices/providers/openai';
import { geminiProvider } from '../voices/providers/gemini';
import { copilotProvider } from '../voices/providers/copilot';
import { OpenAICompatVoice } from '../voices/providers/openai-compat';
import { MockVoice } from '../voices/MockVoice';
import { listCustomProviders } from '../db/queries/customProviders';
import { listProviderConfigs } from '../db/queries/providerConfigs';
import { listTones } from '../db/queries/tones';
import { listSystemPromptTemplates } from '../db/queries/systemPromptTemplates';
import { logger } from '../utils/logger';

// Registry of all known providers. Adding a new provider = add one line here.
const PROVIDER_REGISTRY: VoiceProviderRegistration[] = [
  anthropicProvider,
  openaiProvider,
  geminiProvider,
  copilotProvider,
];

export class VoiceManager {
  // sessionId → (voiceId → Voice)
  private sessions: Map<string, Map<string, Voice>> = new Map();

  private registryByProvider: Map<string, VoiceProviderRegistration> =
    new Map(PROVIDER_REGISTRY.map((p) => [p.provider, p]));

  // id → CustomProvider (non-deleted only)
  private customProviders: Map<string, CustomProvider> = new Map();

  // "${provider}:cli" → ProviderConfig
  private providerCLIConfigs: Map<string, ProviderConfig> = new Map();

  // id → ToneDefinition
  private tonesById: Map<string, ToneDefinition> = new Map();

  // id → SystemPromptTemplate
  private systemPromptTemplatesById: Map<string, SystemPromptTemplate> = new Map();

  private _db: DatabaseSync | null = null;
  private _dataLoaded = false;

  constructor(db?: DatabaseSync) {
    if (db) this._db = db;
  }

  private ensureLoaded(): void {
    if (this._dataLoaded || !this._db) return;
    this.loadCustomProviders(this._db);
    this.loadProviderConfigs(this._db);
    this.loadTones(this._db);
    this.loadSystemPromptTemplates(this._db);
    this._dataLoaded = true;
  }

  loadCustomProviders(db: DatabaseSync): void {
    const providers = listCustomProviders(db);
    this.customProviders = new Map(providers.map((p) => [p.id, p]));
  }

  loadProviderConfigs(db: DatabaseSync): void {
    const configs = listProviderConfigs(db);
    this.providerCLIConfigs = new Map(
      configs.filter((c) => c.voiceType === 'cli').map((c) => [`${c.provider}:cli`, c]),
    );
  }

  loadTones(db: DatabaseSync): void {
    const tones = listTones(db);
    this.tonesById = new Map(tones.map((t) => [t.id, t]));
  }

  loadSystemPromptTemplates(db: DatabaseSync): void {
    const templates = listSystemPromptTemplates(db);
    this.systemPromptTemplatesById = new Map(templates.map((t) => [t.id, t]));
  }

  createVoice(compositionVoice: CompositionVoice): Voice {
    this.ensureLoaded();
    // Resolve effective system prompt: template takes precedence over inline snapshot
    const effectiveSystemPrompt = compositionVoice.systemPromptTemplateId
      ? (this.systemPromptTemplatesById.get(compositionVoice.systemPromptTemplateId)?.content ?? compositionVoice.systemPrompt)
      : compositionVoice.systemPrompt;

    // Inject yolo flag if enabled for this provider's CLI config
    let cliArgs = compositionVoice.cliArgs;
    const providerCLIConfig = this.providerCLIConfigs.get(`${compositionVoice.provider}:cli`);
    if (providerCLIConfig?.yoloMode) {
      const yoloFlag = PROVIDER_METADATA[compositionVoice.provider]?.yoloFlag;
      if (yoloFlag) {
        cliArgs = cliArgs ? [...cliArgs, yoloFlag] : [yoloFlag];
      }
    }

    const config: VoiceConfig = {
      id: compositionVoice.id,
      displayName: compositionVoice.displayName,
      color: compositionVoice.color,
      avatarIcon: compositionVoice.avatarIcon,
      systemPrompt: effectiveSystemPrompt,
      toneOverride: compositionVoice.toneOverride,
      model: compositionVoice.model,
      cliCommand: compositionVoice.cliCommand,
      cliArgs,
    };

    if (process.env.POLYPHON_MOCK_VOICES === '1') {
      return new MockVoice(config, compositionVoice.provider);
    }

    if (compositionVoice.provider === PROVIDER_NAMES.OPENAI_COMPAT) {
      const customProvider = compositionVoice.customProviderId
        ? this.customProviders.get(compositionVoice.customProviderId)
        : undefined;
      if (!customProvider) {
        logger.error('Custom provider not found', { customProviderId: compositionVoice.customProviderId });
        throw new Error(
          `Custom provider not found or has been deleted: "${compositionVoice.customProviderId}". ` +
          `Reload the app or re-configure this voice in the composition.`,
        );
      }
      return new OpenAICompatVoice({
        ...config,
        baseUrl: customProvider.baseUrl,
        apiKeyEnvVar: customProvider.apiKeyEnvVar,
      });
    }

    const registration = this.registryByProvider.get(compositionVoice.provider);
    if (!registration) {
      logger.error('Unknown voice provider', { provider: compositionVoice.provider });
      throw new Error(`Unknown voice provider: "${compositionVoice.provider}"`);
    }

    return registration.create(config);
  }

  getVoice(sessionId: string, voiceId: string): Voice | undefined {
    return this.sessions.get(sessionId)?.get(voiceId);
  }

  getEnsemble(sessionId: string): Voice[] {
    return Array.from(this.sessions.get(sessionId)?.values() ?? []);
  }

  // Builds the injected system prompt that makes a voice aware of the full ensemble
  buildEnsembleSystemPrompt(voice: Voice, ensemble: Voice[], mode: 'conductor' | 'broadcast', profile?: UserProfile, workingDir?: string | null): string {
    this.ensureLoaded();
    const others = ensemble.filter((v) => v.id !== voice.id);
    const roster = others
      .map((v) => `- ${v.name} (${v.provider})`)
      .join('\n');

    const ensembleSection =
      others.length > 0
        ? `The other participants in this session are:\n${roster}`
        : 'You are the only voice in this session.';

    const parts: string[] = [
      `You are ${voice.name}, participating in a multi-agent conversation session called Polyphon.`,
    ];

    if (profile?.conductorName) {
      const pronounNote = profile.pronouns
        ? ` Their preferred pronouns are ${profile.pronouns}.`
        : '';
      parts.push('');
      parts.push(
        `The person you are speaking with is ${profile.conductorName}.${pronounNote} Address them by name naturally in conversation — not in every message, but when it feels right.`,
      );
    }

    if (profile?.conductorContext) {
      parts.push('');
      parts.push(`Background on ${profile.conductorName || 'the conductor'}:\n${profile.conductorContext}`);
    }

    const effectiveTone = voice.toneOverride ?? profile?.defaultTone;
    if (effectiveTone) {
      const toneDesc = this.tonesById.get(effectiveTone)?.description;
      if (toneDesc) {
        parts.push('');
        parts.push(`Conversation tone: ${toneDesc}`);
      }
    }

    parts.push('');
    parts.push(ensembleSection);
    parts.push('');

    if (workingDir) {
      parts.push(`Working directory: ${workingDir}`);
      parts.push('');
    }

    if (mode === 'conductor') {
      parts.push(
        'This is a conductor-directed session. The conductor controls who speaks — only respond when addressed directly. You may reference or mention other voices by name when relevant, but do not direct questions or tasks at them as if expecting them to reply. The conductor will decide if and when to involve other voices.',
      );
    } else {
      parts.push(
        'This is a broadcast session. You will receive the full conversation history including messages from the conductor and all other voices. Respond naturally and reference other voices by name when relevant. Your responses should reflect awareness that you are collaborating with other AI systems, not just answering the conductor alone. The conductor may use @YourName to direct a question specifically at you — when addressed this way, treat it as a direct question rather than a general broadcast.',
      );
    }

    return parts.join('\n');
  }

  initSession(sessionId: string, voices: Voice[], mode: 'conductor' | 'broadcast', profile?: UserProfile, workingDir?: string | null): void {
    this.sessions.set(sessionId, new Map(voices.map((v) => [v.id, v])));
    for (const voice of voices) {
      if (voice.type === 'cli' && 'setWorkingDir' in voice) {
        (voice as unknown as { setWorkingDir: (d: string | null) => void }).setWorkingDir(workingDir ?? null);
      }
      voice.setEnsembleSystemPrompt(
        this.buildEnsembleSystemPrompt(voice, voices, mode, profile, workingDir)
      );
    }
    logger.info('Session voices initialized', {
      sessionId,
      voiceCount: voices.length,
      providers: voices.map((v) => v.provider),
      mode,
    });
  }

  disposeSession(sessionId: string): void {
    const ensemble = this.sessions.get(sessionId);
    if (ensemble) {
      for (const voice of ensemble.values()) voice.abort();
      this.sessions.delete(sessionId);
    }
  }

  disposeAll(): void {
    for (const sessionId of [...this.sessions.keys()]) {
      this.disposeSession(sessionId);
    }
  }
}
