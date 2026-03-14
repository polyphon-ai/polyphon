import { create } from 'zustand';
import type { Composition } from '../../shared/types';

interface CompositionState {
  compositions: Composition[];
  activeCompositionId: string | null;
}

interface CompositionActions {
  setCompositions: (compositions: Composition[]) => void;
  upsertComposition: (composition: Composition) => void;
  removeComposition: (id: string) => void;
  setActiveComposition: (id: string | null) => void;
}

export const useCompositionStore = create<CompositionState & CompositionActions>(
  (set) => ({
    compositions: [],
    activeCompositionId: null,

    setCompositions: (compositions) => set({ compositions }),

    upsertComposition: (composition) =>
      set((s) => {
        const exists = s.compositions.some((c) => c.id === composition.id);
        return {
          compositions: exists
            ? s.compositions.map((c) =>
                c.id === composition.id ? composition : c,
              )
            : [...s.compositions, composition],
        };
      }),

    removeComposition: (id) =>
      set((s) => ({
        compositions: s.compositions.filter((c) => c.id !== id),
      })),

    setActiveComposition: (id) => set({ activeCompositionId: id }),
  }),
);
