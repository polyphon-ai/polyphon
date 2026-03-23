import { create } from 'zustand';
import type { SearchResult } from '../../shared/types';

interface PendingNavigation {
  sessionId: string;
  messageId: string;
  query?: string;
}

interface SearchState {
  // Global search
  globalQuery: string;
  globalResults: SearchResult[];
  globalLoading: boolean;

  // Per-session search
  sessionQuery: string;
  sessionResultIds: string[];
  sessionMatchIndex: number;
  sessionSearchOpen: boolean;

  // Navigation
  pendingNavigation: PendingNavigation | null;
}

interface SearchActions {
  setGlobalQuery: (query: string) => void;
  setGlobalResults: (results: SearchResult[]) => void;
  setGlobalLoading: (loading: boolean) => void;

  setSessionQuery: (query: string) => void;
  setSessionResultIds: (ids: string[]) => void;
  setSessionMatchIndex: (index: number) => void;
  openSessionSearch: () => void;
  closeSessionSearch: () => void;
  nextSessionMatch: () => void;
  prevSessionMatch: () => void;

  setPendingNavigation: (nav: PendingNavigation) => void;
  clearPendingNavigation: () => void;
}

export const useSearchStore = create<SearchState & SearchActions>((set, get) => ({
  globalQuery: '',
  globalResults: [],
  globalLoading: false,

  sessionQuery: '',
  sessionResultIds: [],
  sessionMatchIndex: 0,
  sessionSearchOpen: false,

  pendingNavigation: null,

  setGlobalQuery: (globalQuery) => set({ globalQuery }),
  setGlobalResults: (globalResults) => set({ globalResults }),
  setGlobalLoading: (globalLoading) => set({ globalLoading }),

  setSessionQuery: (sessionQuery) => set({ sessionQuery, sessionMatchIndex: 0 }),
  setSessionResultIds: (sessionResultIds) => set({ sessionResultIds, sessionMatchIndex: 0 }),
  setSessionMatchIndex: (sessionMatchIndex) => set({ sessionMatchIndex }),
  openSessionSearch: () => set({ sessionSearchOpen: true, sessionQuery: '', sessionResultIds: [], sessionMatchIndex: 0 }),
  closeSessionSearch: () => set({ sessionSearchOpen: false, sessionQuery: '', sessionResultIds: [], sessionMatchIndex: 0 }),
  nextSessionMatch: () => {
    const { sessionResultIds, sessionMatchIndex } = get();
    if (sessionResultIds.length === 0) return;
    set({ sessionMatchIndex: (sessionMatchIndex + 1) % sessionResultIds.length });
  },
  prevSessionMatch: () => {
    const { sessionResultIds, sessionMatchIndex } = get();
    if (sessionResultIds.length === 0) return;
    set({ sessionMatchIndex: (sessionMatchIndex - 1 + sessionResultIds.length) % sessionResultIds.length });
  },

  setPendingNavigation: (pendingNavigation) => set({ pendingNavigation }),
  clearPendingNavigation: () => set({ pendingNavigation: null }),
}));
