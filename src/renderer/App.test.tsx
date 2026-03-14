// @vitest-environment happy-dom
import { vi } from 'vitest';

// uiStore calls localStorage.getItem at module initialization time.
// Stub localStorage before any imports so the store initializes cleanly.
vi.hoisted(() => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
    },
  });
});

import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import App from './App';
import { useUIStore } from './store/uiStore';
import { useCompositionStore } from './store/compositionStore';
import { useSettingsStore } from './store/settingsStore';
import { useSessionStore } from './store/sessionStore';
import type { Composition, Session } from '../shared/types';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  useUIStore.setState({ activeView: 'home', sidebarOpen: true, theme: 'system' });
  useCompositionStore.setState({ compositions: [], activeCompositionId: null });
  useSessionStore.setState({
    sessions: [],
    activeSessionId: null,
    openSessionIds: [],
    messages: {},
    streamingContent: {},
    streamingVoices: {},
    pendingVoices: {},
  });
  useSettingsStore.setState({
    providerStatuses: {},
    providerConfigs: {},
    cliTestStates: {},
    modelFetchStates: {},
    saveConfirmation: null,
    loading: false,
    error: null,
  });
});

const baseComposition: Composition = {
  id: 'comp-1',
  name: 'My Composition',
  mode: 'conductor',
  voices: [],
  continuationPolicy: 'none',
  continuationMaxRounds: 2,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  archived: false,
};

const baseSession: Session = {
  id: 'sess-1',
  compositionId: 'comp-1',
  name: 'My Session',
  mode: 'conductor',
  continuationPolicy: 'none',
  continuationMaxRounds: 2,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  archived: false,
};

function stubPolyphon(compositions: Composition[] = [], sessions: Session[] = []) {
  vi.stubGlobal('polyphon', {
    composition: {
      list: vi.fn().mockResolvedValue(compositions),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      get: vi.fn().mockResolvedValue(null),
    },
    session: {
      list: vi.fn().mockResolvedValue(sessions),
      create: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      archive: vi.fn(),
      listMessages: vi.fn().mockResolvedValue([]),
      onContinuationPrompt: vi.fn().mockReturnValue(() => {}),
      onNoTarget: vi.fn().mockReturnValue(() => {}),
    },
    voice: {
      send: vi.fn(),
      abort: vi.fn(),
      onPending: vi.fn().mockReturnValue(() => {}),
      onToken: vi.fn().mockReturnValue(() => {}),
      onDone: vi.fn().mockReturnValue(() => {}),
      onError: vi.fn().mockReturnValue(() => {}),
    },
    settings: {
      getProviderStatus: vi.fn().mockResolvedValue([]),
      getProviderConfig: vi.fn().mockResolvedValue([]),
      saveProviderConfig: vi.fn(),
      testCliVoice: vi.fn(),
      fetchModels: vi.fn().mockResolvedValue({ models: [] }),
    },
  });
}

describe('App startup', () => {
  it('shows home dashboard on startup', async () => {
    stubPolyphon([]);
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '+ New Session' })).toBeTruthy();
    });
  });

  it('loads settings on startup', async () => {
    stubPolyphon([]);
    render(<App />);
    await waitFor(() => {
      expect(
        (window as unknown as { polyphon: { settings: { getProviderConfig: ReturnType<typeof vi.fn>; getProviderStatus: ReturnType<typeof vi.fn> } } }).polyphon.settings.getProviderConfig,
      ).toHaveBeenCalled();
      expect(
        (window as unknown as { polyphon: { settings: { getProviderConfig: ReturnType<typeof vi.fn>; getProviderStatus: ReturnType<typeof vi.fn> } } }).polyphon.settings.getProviderStatus,
      ).toHaveBeenCalled();
    });
  });
});

describe('Dashboard', () => {
  it('renders welcome heading and both action buttons', async () => {
    stubPolyphon([]);
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '+ New Session' })).toBeTruthy();
      expect(screen.getByRole('button', { name: '+ New Composition' })).toBeTruthy();
    });
  });

  it('"New Composition" button navigates to composition-builder', async () => {
    stubPolyphon([]);
    render(<App />);
    await waitFor(() => screen.getByRole('button', { name: '+ New Composition' }));
    fireEvent.click(screen.getByRole('button', { name: '+ New Composition' }));
    expect(useUIStore.getState().activeView).toBe('composition-builder');
  });

  it('renders recent session names from mock data', async () => {
    stubPolyphon([baseComposition], [baseSession]);
    render(<App />);
    await waitFor(() => {
      expect(screen.getAllByText('My Session').length).toBeGreaterThan(0);
    });
  });

  it('clicking a recent session navigates to session view', async () => {
    stubPolyphon([baseComposition], [baseSession]);
    render(<App />);
    await waitFor(() => screen.getAllByText('My Session'));
    fireEvent.click(screen.getAllByText('My Session')[0]!);
    expect(useUIStore.getState().activeView).toBe('session');
    expect(useSessionStore.getState().activeSessionId).toBe('sess-1');
  });

  it('shows empty state when no sessions exist', async () => {
    stubPolyphon([], []);
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('No sessions yet')).toBeTruthy();
    });
  });
});
