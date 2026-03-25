import type { Message } from '../../../shared/types';
import { CLIVoice } from '../CLIVoice';
import type { VoiceConfig, VoiceProviderRegistration } from '../Voice';
import { PROVIDER_NAMES } from '../../../shared/constants';

class CopilotVoice extends CLIVoice {
  readonly provider = PROVIDER_NAMES.COPILOT;

  constructor(config: VoiceConfig) {
    super({ ...config, defaultCommand: 'copilot' });
  }

  async *send(_message: Message, context: Message[]): AsyncIterable<string> {
    const extraArgs: string[] = [];
    if (this.yoloMode) extraArgs.push('--allow-all');
    yield* this.spawnAndStream(this.buildPrompt(context), extraArgs);
  }
}

export const copilotProvider: VoiceProviderRegistration = {
  provider: PROVIDER_NAMES.COPILOT,
  type: 'cli',
  create: (config: VoiceConfig) => new CopilotVoice(config),
};
