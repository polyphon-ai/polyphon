import type { Message } from '../../shared/types';
import { APIVoice } from './APIVoice';
import type { VoiceConfig } from './Voice';

// Mock voice used when POLYPHON_MOCK_VOICES=1 (e2e tests).
// Yields a short scripted response word-by-word with small delays so that
// Playwright can observe the streaming state transitions.
export class MockVoice extends APIVoice {
  readonly provider: string;

  constructor(config: VoiceConfig, providerName: string) {
    super({ ...config, defaultModel: 'mock' });
    this.provider = providerName;
  }

  async *send(_message: Message, _context: Message[]): AsyncIterable<string> {
    const words = `Mock response from ${this.name}!`.split(' ');
    for (const word of words) {
      yield word + ' ';
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
    }
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
