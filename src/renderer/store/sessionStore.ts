import { create } from 'zustand';
import type { Session, Message, VoiceDescriptor } from '../../shared/types';

interface SessionState {
  sessions: Session[];
  activeSessionId: string | null;
  openSessionIds: string[];
  // sessionId → ordered messages (single source of truth)
  messages: Record<string, Message[]>;
  // sessionId → voiceId → accumulated streamed content (while streaming)
  streamingContent: Record<string, Record<string, string>>;
  // sessionId → voiceIds currently streaming
  streamingVoices: Record<string, Set<string>>;
  // sessionId → voiceIds dispatched but not yet producing tokens
  pendingVoices: Record<string, Set<string>>;
}

interface SessionActions {
  setActiveSession: (id: string | null) => void;
  setSessions: (sessions: Session[]) => void;
  removeSession: (id: string) => void;
  renameSession: (id: string, name: string) => void;
  openSession: (id: string) => void;
  closeSession: (id: string) => void;
  setMessages: (sessionId: string, messages: Message[]) => void;
  appendMessage: (sessionId: string, message: Message) => void;
  markVoicePending: (sessionId: string, voiceId: string) => void;
  appendToken: (sessionId: string, voiceId: string, token: string) => void;
  markStreamDone: (sessionId: string, voiceId: string) => void;
}

export const useSessionStore = create<SessionState & SessionActions>((set) => ({
  sessions: [],
  activeSessionId: null,
  openSessionIds: [],
  messages: {},
  streamingContent: {},
  streamingVoices: {},
  pendingVoices: {},

  setActiveSession: (id) => set({ activeSessionId: id }),
  setSessions: (sessions) => set({ sessions }),

  openSession: (id) =>
    set((s) => ({
      openSessionIds: s.openSessionIds.includes(id)
        ? s.openSessionIds
        : [id, ...s.openSessionIds],
      activeSessionId: id,
    })),

  closeSession: (id) =>
    set((s) => {
      const next = s.openSessionIds.filter((sid) => sid !== id);
      const nextActive =
        s.activeSessionId === id ? (next[0] ?? null) : s.activeSessionId;
      return { openSessionIds: next, activeSessionId: nextActive };
    }),

  renameSession: (id, name) =>
    set((s) => ({
      sessions: s.sessions.map((sess) => (sess.id === id ? { ...sess, name } : sess)),
    })),

  removeSession: (id) =>
    set((s) => {
      const nextOpen = s.openSessionIds.filter((sid) => sid !== id);
      const nextActive =
        s.activeSessionId === id ? (nextOpen[0] ?? null) : s.activeSessionId;
      const nextStreamingContent = { ...s.streamingContent };
      delete nextStreamingContent[id];
      const nextStreamingVoices = { ...s.streamingVoices };
      delete nextStreamingVoices[id];
      const nextPendingVoices = { ...s.pendingVoices };
      delete nextPendingVoices[id];
      return {
        sessions: s.sessions.filter((sess) => sess.id !== id),
        openSessionIds: nextOpen,
        activeSessionId: nextActive,
        streamingContent: nextStreamingContent,
        streamingVoices: nextStreamingVoices,
        pendingVoices: nextPendingVoices,
      };
    }),

  setMessages: (sessionId, messages) =>
    set((s) => ({ messages: { ...s.messages, [sessionId]: messages } })),

  appendMessage: (sessionId, message) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [sessionId]: [...(s.messages[sessionId] ?? []), message],
      },
    })),

  markVoicePending: (sessionId, voiceId) =>
    set((s) => ({
      pendingVoices: {
        ...s.pendingVoices,
        [sessionId]: new Set<string>([
          ...(s.pendingVoices[sessionId] ?? new Set<string>()),
          voiceId,
        ]),
      },
    })),

  appendToken: (sessionId, voiceId, token) =>
    set((s) => {
      const nextPending = new Set<string>(
        s.pendingVoices[sessionId] ?? new Set<string>(),
      );
      nextPending.delete(voiceId);
      const nextStreamingVoices = new Set<string>(
        s.streamingVoices[sessionId] ?? new Set<string>(),
      );
      nextStreamingVoices.add(voiceId);
      const sessionStreamingContent = s.streamingContent[sessionId] ?? {};
      return {
        streamingContent: {
          ...s.streamingContent,
          [sessionId]: {
            ...sessionStreamingContent,
            [voiceId]: (sessionStreamingContent[voiceId] ?? '') + token,
          },
        },
        streamingVoices: {
          ...s.streamingVoices,
          [sessionId]: nextStreamingVoices,
        },
        pendingVoices: {
          ...s.pendingVoices,
          [sessionId]: nextPending,
        },
      };
    }),

  markStreamDone: (sessionId, voiceId) =>
    set((s) => {
      const nextVoices = new Set<string>(
        s.streamingVoices[sessionId] ?? new Set<string>(),
      );
      nextVoices.delete(voiceId);
      const sessionStreamingContent = { ...(s.streamingContent[sessionId] ?? {}) };
      delete sessionStreamingContent[voiceId];
      const nextPending = new Set<string>(
        s.pendingVoices[sessionId] ?? new Set<string>(),
      );
      nextPending.delete(voiceId);
      return {
        streamingVoices: {
          ...s.streamingVoices,
          [sessionId]: nextVoices,
        },
        streamingContent: {
          ...s.streamingContent,
          [sessionId]: sessionStreamingContent,
        },
        pendingVoices: {
          ...s.pendingVoices,
          [sessionId]: nextPending,
        },
      };
    }),
}));

export type { Session, Message, VoiceDescriptor };
