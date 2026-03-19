import { create } from 'zustand';
import type { UpdateInfo } from '../../shared/types';

type View = 'home' | 'session' | 'composition-builder' | 'settings';
export type Theme = 'light' | 'dark' | 'system';

interface UIState {
  activeView: View;
  sidebarOpen: boolean;
  theme: Theme;
  updateAvailable: UpdateInfo | null;
}

interface UIActions {
  setView: (view: View) => void;
  toggleSidebar: () => void;
  setTheme: (theme: Theme) => void;
  setUpdateAvailable: (info: UpdateInfo) => void;
  clearUpdate: () => void;
}

function loadTheme(): Theme {
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  return 'system';
}

export const useUIStore = create<UIState & UIActions>((set) => ({
  activeView: 'home',
  sidebarOpen: true,
  theme: loadTheme(),
  updateAvailable: null,

  setView: (activeView) => set({ activeView }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setTheme: (theme) => {
    localStorage.setItem('theme', theme);
    set({ theme });
  },
  setUpdateAvailable: (info) => set({ updateAvailable: info }),
  clearUpdate: () => set({ updateAvailable: null }),
}));
