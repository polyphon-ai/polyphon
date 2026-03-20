import { create } from 'zustand';
import type { UpdateInfo, UpdateDownloadProgress } from '../../shared/types';

type View = 'home' | 'session' | 'composition-builder' | 'settings';
export type Theme = 'light' | 'dark' | 'system';

interface UIState {
  activeView: View;
  sidebarOpen: boolean;
  theme: Theme;
  updateAvailable: UpdateInfo | null;
  updateDownloadProgress: UpdateDownloadProgress | null;
  updateReadyToInstall: UpdateInfo | null;
}

interface UIActions {
  setView: (view: View) => void;
  toggleSidebar: () => void;
  setTheme: (theme: Theme) => void;
  setUpdateAvailable: (info: UpdateInfo) => void;
  setUpdateDownloadProgress: (progress: UpdateDownloadProgress) => void;
  setUpdateReadyToInstall: (info: UpdateInfo) => void;
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
  updateDownloadProgress: null,
  updateReadyToInstall: null,

  setView: (activeView) => set({ activeView }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setTheme: (theme) => {
    localStorage.setItem('theme', theme);
    set({ theme });
  },
  setUpdateAvailable: (info) => set({ updateAvailable: info }),
  setUpdateDownloadProgress: (progress) => set({ updateDownloadProgress: progress }),
  setUpdateReadyToInstall: (info) => set({ updateReadyToInstall: info, updateDownloadProgress: null }),
  clearUpdate: () => set({ updateAvailable: null, updateDownloadProgress: null, updateReadyToInstall: null }),
}));
