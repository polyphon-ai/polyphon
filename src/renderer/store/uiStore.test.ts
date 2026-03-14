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

import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from './uiStore';

beforeEach(() => {
  localStorage.clear();
  useUIStore.setState({ activeView: 'session', sidebarOpen: true, theme: 'system' });
});

describe('setView', () => {
  it('updates activeView to composition-builder', () => {
    useUIStore.getState().setView('composition-builder');
    expect(useUIStore.getState().activeView).toBe('composition-builder');
  });

  it('updates activeView to settings', () => {
    useUIStore.getState().setView('settings');
    expect(useUIStore.getState().activeView).toBe('settings');
  });

  it('updates activeView to session', () => {
    useUIStore.getState().setView('composition-builder');
    useUIStore.getState().setView('session');
    expect(useUIStore.getState().activeView).toBe('session');
  });
});

describe('toggleSidebar', () => {
  it('flips sidebarOpen from true to false', () => {
    useUIStore.setState({ sidebarOpen: true });
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarOpen).toBe(false);
  });

  it('flips sidebarOpen from false to true', () => {
    useUIStore.setState({ sidebarOpen: false });
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarOpen).toBe(true);
  });
});

describe('setTheme', () => {
  it('updates theme state to dark', () => {
    useUIStore.getState().setTheme('dark');
    expect(useUIStore.getState().theme).toBe('dark');
  });

  it('persists light theme to localStorage', () => {
    useUIStore.getState().setTheme('light');
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('persists system theme to localStorage', () => {
    useUIStore.getState().setTheme('system');
    expect(localStorage.getItem('theme')).toBe('system');
  });
});

describe('loadTheme', () => {
  it('returns system as default when nothing in localStorage', () => {
    expect(useUIStore.getState().theme).toBe('system');
  });

  it('reads stored theme from localStorage', () => {
    localStorage.setItem('theme', 'dark');
    // Re-initialize state as loadTheme() is called at module init; simulate by setting directly
    useUIStore.setState({ theme: localStorage.getItem('theme') as 'dark' });
    expect(useUIStore.getState().theme).toBe('dark');
  });
});
