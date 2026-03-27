import type { Composition, Session, Message } from '../../shared/types';
import type { SettingsGetUserProfileResult } from '../../shared/api';

export const DEFAULT_VOICES: Composition['voices'] = [
  {
    id: 'voice-claude',
    compositionId: 'comp-default',
    provider: 'anthropic',
    model: 'claude-opus-4-6',
    displayName: 'Claude',
    order: 0,
    color: '#D4763B',
    avatarIcon: 'sparkles',
  },
  {
    id: 'voice-gpt4o',
    compositionId: 'comp-default',
    provider: 'openai',
    model: 'gpt-4o',
    displayName: 'GPT-4o',
    order: 1,
    color: '#10A37F',
    avatarIcon: 'brain',
  },
];

export const DEFAULT_COMPOSITION: Composition = {
  id: 'comp-default',
  name: 'Default',
  mode: 'broadcast',
  continuationPolicy: 'none',
  continuationMaxRounds: 1,
  voices: DEFAULT_VOICES,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
  archived: false,
};

export const DEFAULT_SESSION: Session = {
  id: 'session-default',
  compositionId: 'comp-default',
  name: 'Default Session',
  mode: 'broadcast',
  continuationPolicy: 'none',
  continuationMaxRounds: 1,
  createdAt: 1700000001000,
  updatedAt: 1700000001000,
  archived: false,
  workingDir: null,
  sandboxedToWorkingDir: false,
  source: 'test',
};

export const DEFAULT_MESSAGES: Message[] = [
  {
    id: 'msg-1',
    sessionId: 'session-default',
    role: 'conductor',
    voiceId: null,
    voiceName: null,
    content: 'Hello voices, what is the capital of France?',
    timestamp: 1700000002000,
    roundIndex: 0,
  },
  {
    id: 'msg-2',
    sessionId: 'session-default',
    role: 'voice',
    voiceId: 'voice-claude',
    voiceName: 'Claude',
    content: 'The capital of France is Paris, a city rich in history and culture.',
    timestamp: 1700000003000,
    roundIndex: 0,
  },
  {
    id: 'msg-3',
    sessionId: 'session-default',
    role: 'voice',
    voiceId: 'voice-gpt4o',
    voiceName: 'GPT-4o',
    content: 'Paris is the capital of France and one of the most visited cities in the world.',
    timestamp: 1700000004000,
    roundIndex: 0,
  },
];

export const DEFAULT_PROFILE: SettingsGetUserProfileResult = {
  conductorName: 'Test Conductor',
  pronouns: 'they/them',
  conductorColor: '#6366F1',
  conductorAvatar: '',
};
