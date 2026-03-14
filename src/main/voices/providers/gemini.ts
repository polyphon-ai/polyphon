import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Message } from '../../../shared/types';
import { APIVoice } from '../APIVoice';
import type { VoiceConfig, VoiceProviderRegistration } from '../Voice';
import { PROVIDER_NAMES } from '../../../shared/constants';
import { resolveApiKey } from '../../utils/env';

type GeminiRole = 'user' | 'model';
type GeminiContent = { role: GeminiRole; parts: { text: string }[] };

function buildContents(voiceId: string, context: Message[]): GeminiContent[] {
  const raw: { role: GeminiRole; text: string }[] = context
    .filter((msg) => msg.content.trim() !== '' || msg.role === 'conductor')
    .map((msg) => {
      if (msg.role === 'conductor') {
        return { role: 'user' as const, text: msg.content.trim() || 'Please continue.' };
      }
      if (msg.voiceId === voiceId) {
        return { role: 'model' as const, text: msg.content };
      }
      return { role: 'user' as const, text: `[${msg.voiceName}]: ${msg.content}` };
    });

  // Merge consecutive same-role messages
  const merged: { role: GeminiRole; text: string }[] = [];
  for (const msg of raw) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      last.text += '\n' + msg.text;
    } else {
      merged.push({ ...msg });
    }
  }

  return merged.map(({ role, text }) => ({ role, parts: [{ text }] }));
}

class GeminiVoice extends APIVoice {
  readonly provider = PROVIDER_NAMES.GEMINI;

  constructor(config: VoiceConfig) {
    super({ ...config, defaultModel: 'gemini-2.5-flash' });
  }

  async *send(_message: Message, context: Message[]): AsyncIterable<string> {
    const apiKey = resolveApiKey('gemini');
    const genAI = new GoogleGenerativeAI(apiKey);
    const systemPrompt = this.buildSystemPrompt();

    const model = genAI.getGenerativeModel({
      model: this.model,
      ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
    });

    const contents = buildContents(this.id, context);

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      const result = await model.generateContentStream({ contents });
      for await (const chunk of result.stream) {
        if (signal.aborted) return;
        const text = chunk.text();
        if (text) yield text;
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      throw err;
    } finally {
      this.abortController = null;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      resolveApiKey('gemini');
      return true;
    } catch {
      return false;
    }
  }
}

export const geminiProvider: VoiceProviderRegistration = {
  provider: PROVIDER_NAMES.GEMINI,
  type: 'api',
  create: (config: VoiceConfig) => new GeminiVoice(config),
};
