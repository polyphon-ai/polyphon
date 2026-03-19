import { describe, it, expect, beforeEach } from 'vitest';
import { useCompositionStore } from './compositionStore';
import type { Composition } from '../../shared/types';

function makeComp(id: string, name = 'Test'): Composition {
  return { id, name, mode: 'conductor', voices: [], continuationPolicy: 'none', continuationMaxRounds: 2, createdAt: 1000, updatedAt: 1000, archived: false };
}

beforeEach(() => {
  useCompositionStore.setState({ compositions: [], activeCompositionId: null });
});

describe('setCompositions', () => {
  it('replaces the list', () => {
    const comps = [makeComp('c-1'), makeComp('c-2')];
    useCompositionStore.getState().setCompositions(comps);
    expect(useCompositionStore.getState().compositions).toEqual(comps);
  });
});

describe('upsertComposition', () => {
  it('adds new composition when id not present', () => {
    const comp = makeComp('c-1');
    useCompositionStore.getState().upsertComposition(comp);
    expect(useCompositionStore.getState().compositions).toEqual([comp]);
  });

  it('replaces existing composition when id matches', () => {
    useCompositionStore.setState({ compositions: [makeComp('c-1', 'Old Name')] });
    const updated = makeComp('c-1', 'New Name');
    useCompositionStore.getState().upsertComposition(updated);
    const { compositions } = useCompositionStore.getState();
    expect(compositions).toHaveLength(1);
    expect(compositions[0]!.name).toBe('New Name');
  });

  it('preserves other compositions when updating one', () => {
    const other = makeComp('c-2', 'Other');
    useCompositionStore.setState({ compositions: [makeComp('c-1', 'Old'), other] });
    useCompositionStore.getState().upsertComposition(makeComp('c-1', 'Updated'));
    const { compositions } = useCompositionStore.getState();
    expect(compositions).toHaveLength(2);
    expect(compositions.find((c) => c.id === 'c-2')).toEqual(other);
  });
});

describe('removeComposition', () => {
  it('removes matching composition', () => {
    useCompositionStore.setState({ compositions: [makeComp('c-1'), makeComp('c-2')] });
    useCompositionStore.getState().removeComposition('c-1');
    const { compositions } = useCompositionStore.getState();
    expect(compositions).toHaveLength(1);
    expect(compositions[0]!.id).toBe('c-2');
  });

  it('does nothing when id not found', () => {
    const comps = [makeComp('c-1')];
    useCompositionStore.setState({ compositions: comps });
    useCompositionStore.getState().removeComposition('c-99');
    expect(useCompositionStore.getState().compositions).toEqual(comps);
  });
});

describe('setActiveComposition', () => {
  it('sets activeCompositionId', () => {
    useCompositionStore.getState().setActiveComposition('c-1');
    expect(useCompositionStore.getState().activeCompositionId).toBe('c-1');
  });

  it('clears activeCompositionId when called with null', () => {
    useCompositionStore.getState().setActiveComposition('c-1');
    useCompositionStore.getState().setActiveComposition(null);
    expect(useCompositionStore.getState().activeCompositionId).toBeNull();
  });
});
