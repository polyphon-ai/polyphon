// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import VoiceOrderList from './VoiceOrderList';
import { useSettingsStore } from '../../store/settingsStore';
import type { CompositionVoice } from '../../../shared/types';

afterEach(cleanup);

function makeVoice(overrides: Partial<CompositionVoice> & { id: string; displayName: string }): CompositionVoice {
  return {
    compositionId: 'comp-1',
    provider: 'anthropic',
    color: '#6366f1',
    avatarIcon: 'anthropic',
    order: 0,
    ...overrides,
  };
}

function setupStore() {
  useSettingsStore.setState({
    providerConfigs: {},
    customProviders: [],
    tones: [],
    systemPromptTemplates: [],
    modelFetchStates: {},
    customProviderModelFetchStates: {},
  });
}

describe('VoiceOrderList — duplicate name validation', () => {
  it('shows error and does not call onUpdate when saving with a duplicate name', () => {
    setupStore();
    const onUpdate = vi.fn();
    const voices = [
      makeVoice({ id: 'v1', displayName: 'Alice', color: '#6366f1', order: 0 }),
      makeVoice({ id: 'v2', displayName: 'Bob', color: '#ec4899', order: 1 }),
    ];
    render(<VoiceOrderList voices={voices} onReorder={vi.fn()} onRemove={vi.fn()} onUpdate={onUpdate} />);

    // Expand v2's edit form
    fireEvent.click(screen.getByRole('button', { name: /Edit Bob/i }));

    // Change name to match v1
    const nameInput = screen.getByDisplayValue('Bob') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Alice' } });

    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText(/A voice named "Alice" already exists/i)).toBeTruthy();
  });

  it('shows error for case-insensitive duplicate on save', () => {
    setupStore();
    const onUpdate = vi.fn();
    const voices = [
      makeVoice({ id: 'v1', displayName: 'Alice', color: '#6366f1', order: 0 }),
      makeVoice({ id: 'v2', displayName: 'Bob', color: '#ec4899', order: 1 }),
    ];
    render(<VoiceOrderList voices={voices} onReorder={vi.fn()} onRemove={vi.fn()} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: /Edit Bob/i }));

    const nameInput = screen.getByDisplayValue('Bob') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'alice' } }); // lowercase

    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText(/already exists/i)).toBeTruthy();
  });

  it('clears error when display name input is changed after a duplicate error', () => {
    setupStore();
    const voices = [
      makeVoice({ id: 'v1', displayName: 'Alice', color: '#6366f1', order: 0 }),
      makeVoice({ id: 'v2', displayName: 'Bob', color: '#ec4899', order: 1 }),
    ];
    render(<VoiceOrderList voices={voices} onReorder={vi.fn()} onRemove={vi.fn()} onUpdate={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Edit Bob/i }));

    const nameInput = screen.getByDisplayValue('Bob') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Alice' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    expect(screen.getByText(/already exists/i)).toBeTruthy();

    fireEvent.change(nameInput, { target: { value: 'Charlie' } });
    expect(screen.queryByText(/already exists/i)).toBeNull();
  });

  it('allows saving with a unique name', () => {
    setupStore();
    const onUpdate = vi.fn();
    const voices = [
      makeVoice({ id: 'v1', displayName: 'Alice', color: '#6366f1', order: 0 }),
      makeVoice({ id: 'v2', displayName: 'Bob', color: '#ec4899', order: 1 }),
    ];
    render(<VoiceOrderList voices={voices} onReorder={vi.fn()} onRemove={vi.fn()} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: /Edit Bob/i }));

    const nameInput = screen.getByDisplayValue('Bob') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Charlie' } });

    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    expect(onUpdate).toHaveBeenCalledOnce();
    expect(screen.queryByText(/already exists/i)).toBeNull();
  });

  it('allows keeping the same name when saving without changes', () => {
    setupStore();
    const onUpdate = vi.fn();
    const voices = [
      makeVoice({ id: 'v1', displayName: 'Alice', color: '#6366f1', order: 0 }),
      makeVoice({ id: 'v2', displayName: 'Bob', color: '#ec4899', order: 1 }),
    ];
    render(<VoiceOrderList voices={voices} onReorder={vi.fn()} onRemove={vi.fn()} onUpdate={onUpdate} />);

    // Expand Bob and save without changing the name
    fireEvent.click(screen.getByRole('button', { name: /Edit Bob/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    expect(onUpdate).toHaveBeenCalledOnce();
    expect(screen.queryByText(/already exists/i)).toBeNull();
  });
});
