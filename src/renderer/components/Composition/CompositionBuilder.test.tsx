// @vitest-environment happy-dom
import { vi } from 'vitest';

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

let voiceCounter = 0;

vi.mock('./VoiceSelector', () => ({
  default: ({ onSelect }: { onSelect: (v: unknown) => void }) => {
    const names = ['Alice', 'Bob', 'Carol'];
    return (
      <button
        data-testid="add-voice"
        onClick={() => {
          const name = names[voiceCounter % names.length] ?? 'Voice';
          voiceCounter++;
          onSelect({
            provider: 'anthropic',
            model: 'claude-opus-4-6',
            displayName: name,
            color: '#D4763B',
            avatarIcon: 'A',
            systemPrompt: '',
          });
        }}
      >
        Add Voice
      </button>
    );
  },
}));

vi.mock('./VoiceOrderList', () => ({
  default: ({
    voices,
    onRemove,
  }: {
    voices: Array<{ id: string; displayName: string }>;
    onRemove: (id: string) => void;
    onReorder: (v: unknown[]) => void;
  }) => (
    <div data-testid="voice-order-list">
      {voices.map((v) => (
        <div key={v.id} data-testid={`voice-${v.displayName}`}>
          {v.displayName}
          <button onClick={() => onRemove(v.id)}>Remove {v.displayName}</button>
        </div>
      ))}
    </div>
  ),
}));

import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import CompositionBuilder from './CompositionBuilder';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  voiceCounter = 0;
});

function stubMinimalPolyphon() {
  vi.stubGlobal('polyphon', {
    settings: {
      getProviderStatus: vi.fn().mockResolvedValue([]),
      getProviderConfig: vi.fn().mockResolvedValue([]),
      saveProviderConfig: vi.fn(),
      testCliVoice: vi.fn(),
      fetchModels: vi.fn().mockResolvedValue({ models: [] }),
    },
  });
}

beforeEach(() => {
  stubMinimalPolyphon();
});

describe('CompositionBuilder', () => {
  // ── Heading ─────────────────────────────────────────────────────────────────

  it('shows "New Composition" heading when initial has no name', () => {
    render(<CompositionBuilder onSave={vi.fn()} />);
    expect(screen.getByText('New Composition')).toBeTruthy();
  });

  it('shows "Edit Composition" heading when initial has a name', () => {
    render(
      <CompositionBuilder
        initial={{ name: 'My Comp', mode: 'conductor' }}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText('Edit Composition')).toBeTruthy();
  });

  // ── Form state ──────────────────────────────────────────────────────────────

  it('the composition name field accepts input', async () => {
    const user = userEvent.setup();
    render(<CompositionBuilder onSave={vi.fn()} />);
    const nameInput = screen.getByPlaceholderText('My Composition');
    await user.type(nameInput, 'My New Comp');
    expect((nameInput as HTMLInputElement).value).toBe('My New Comp');
  });

  it('onSave receives the typed composition name (trimmed)', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CompositionBuilder onSave={onSave} />);
    await user.type(screen.getByPlaceholderText('My Composition'), '  My Comp  ');
    await user.click(screen.getByTestId('add-voice'));
    await user.click(screen.getByRole('button', { name: 'Save Composition' }));
    expect(onSave.mock.calls[0]![0].name).toBe('My Comp');
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  it('shows validation error when Save clicked with empty name', async () => {
    const user = userEvent.setup();
    render(<CompositionBuilder onSave={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Save Composition' }));
    expect(screen.getByText('Name is required.')).toBeTruthy();
  });

  it('shows validation error when Save clicked with no voices', async () => {
    const user = userEvent.setup();
    render(<CompositionBuilder onSave={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('My Composition'), 'Test Comp');
    await user.click(screen.getByRole('button', { name: 'Save Composition' }));
    expect(screen.getByText('Add at least one voice.')).toBeTruthy();
  });

  // ── Mode selection ───────────────────────────────────────────────────────────

  it('default mode is Broadcast (continuation policy visible)', () => {
    render(<CompositionBuilder onSave={vi.fn()} />);
    expect(screen.getByText('Continuation Policy')).toBeTruthy();
  });

  it('default continuation policy is Prompt me', () => {
    render(<CompositionBuilder onSave={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Prompt me/ })).toBeTruthy();
  });

  it('clicking "Conductor-Directed" hides continuation policy', async () => {
    const user = userEvent.setup();
    render(<CompositionBuilder onSave={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Conductor-Directed/ }));
    expect(screen.queryByText('Continuation Policy')).toBeNull();
  });

  it('broadcast → conductor → broadcast: continuation policy shows/hides correctly', async () => {
    const user = userEvent.setup();
    render(<CompositionBuilder onSave={vi.fn()} />);
    expect(screen.getByText('Continuation Policy')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Conductor-Directed/ }));
    expect(screen.queryByText('Continuation Policy')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Broadcast/ }));
    expect(screen.getByText('Continuation Policy')).toBeTruthy();
  });

  it('onSave receives the selected mode (broadcast)', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CompositionBuilder onSave={onSave} />);
    await user.type(screen.getByPlaceholderText('My Composition'), 'BC');
    await user.click(screen.getByTestId('add-voice'));
    await user.click(screen.getByRole('button', { name: 'Save Composition' }));
    expect(onSave.mock.calls[0]![0].mode).toBe('broadcast');
  });

  it('onSave receives the selected mode (conductor)', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CompositionBuilder onSave={onSave} />);
    await user.type(screen.getByPlaceholderText('My Composition'), 'CD');
    await user.click(screen.getByRole('button', { name: /Conductor-Directed/ }));
    await user.click(screen.getByTestId('add-voice'));
    await user.click(screen.getByRole('button', { name: 'Save Composition' }));
    expect(onSave.mock.calls[0]![0].mode).toBe('conductor');
  });

  it('onSave receives the selected continuation policy when broadcast', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CompositionBuilder onSave={onSave} />);
    await user.type(screen.getByPlaceholderText('My Composition'), 'BC Prompt');
    await user.click(screen.getByRole('button', { name: /Broadcast/ }));
    await user.click(screen.getByRole('button', { name: /Prompt me/ }));
    await user.click(screen.getByTestId('add-voice'));
    await user.click(screen.getByRole('button', { name: 'Save Composition' }));
    expect(onSave.mock.calls[0]![0].continuationPolicy).toBe('prompt');
  });

  // ── Voice management ─────────────────────────────────────────────────────────

  it('clicking "Add Voice" adds one voice entry to the roster', async () => {
    const user = userEvent.setup();
    render(<CompositionBuilder onSave={vi.fn()} />);
    expect(screen.queryByTestId('voice-order-list')).toBeNull();
    await user.click(screen.getByTestId('add-voice'));
    expect(screen.getByTestId('voice-order-list')).toBeTruthy();
    expect(screen.getByTestId('voice-Alice')).toBeTruthy();
  });

  it('adding two voices builds a two-entry roster', async () => {
    const user = userEvent.setup();
    render(<CompositionBuilder onSave={vi.fn()} />);
    await user.click(screen.getByTestId('add-voice'));
    await user.click(screen.getByTestId('add-voice'));
    expect(screen.getByTestId('voice-Alice')).toBeTruthy();
    expect(screen.getByTestId('voice-Bob')).toBeTruthy();
  });

  it('adding three voices builds a three-entry roster', async () => {
    const user = userEvent.setup();
    render(<CompositionBuilder onSave={vi.fn()} />);
    await user.click(screen.getByTestId('add-voice'));
    await user.click(screen.getByTestId('add-voice'));
    await user.click(screen.getByTestId('add-voice'));
    expect(screen.getByTestId('voice-Alice')).toBeTruthy();
    expect(screen.getByTestId('voice-Bob')).toBeTruthy();
    expect(screen.getByTestId('voice-Carol')).toBeTruthy();
  });

  it('after adding two voices, removing one leaves one entry', async () => {
    const user = userEvent.setup();
    render(<CompositionBuilder onSave={vi.fn()} />);
    await user.click(screen.getByTestId('add-voice'));
    await user.click(screen.getByTestId('add-voice'));
    expect(screen.getByTestId('voice-Alice')).toBeTruthy();
    expect(screen.getByTestId('voice-Bob')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Remove Bob' }));
    expect(screen.queryByTestId('voice-Bob')).toBeNull();
    expect(screen.getByTestId('voice-Alice')).toBeTruthy();
  });

  it('onSave callback receives the correct voices array with two entries', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CompositionBuilder onSave={onSave} />);
    await user.type(screen.getByPlaceholderText('My Composition'), 'Two Voice Comp');
    await user.click(screen.getByTestId('add-voice'));
    await user.click(screen.getByTestId('add-voice'));
    await user.click(screen.getByRole('button', { name: 'Save Composition' }));
    const { voices } = onSave.mock.calls[0]![0];
    expect(voices).toHaveLength(2);
    expect(voices[0].displayName).toBe('Alice');
    expect(voices[1].displayName).toBe('Bob');
  });

  it('onSave callback receives the correct voices array with three entries', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CompositionBuilder onSave={onSave} />);
    await user.type(screen.getByPlaceholderText('My Composition'), 'Three Voice Comp');
    await user.click(screen.getByTestId('add-voice'));
    await user.click(screen.getByTestId('add-voice'));
    await user.click(screen.getByTestId('add-voice'));
    await user.click(screen.getByRole('button', { name: 'Save Composition' }));
    const { voices } = onSave.mock.calls[0]![0];
    expect(voices).toHaveLength(3);
    expect(voices[0].displayName).toBe('Alice');
    expect(voices[1].displayName).toBe('Bob');
    expect(voices[2].displayName).toBe('Carol');
  });

  // ── Cancel ───────────────────────────────────────────────────────────────────

  it('clicking Cancel calls onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<CompositionBuilder onSave={vi.fn()} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  // ── Full save round-trip ─────────────────────────────────────────────────────

  it('calls onSave with trimmed name and correct data when valid', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CompositionBuilder onSave={onSave} />);
    await user.type(screen.getByPlaceholderText('My Composition'), '  My Comp  ');
    await user.click(screen.getByTestId('add-voice'));
    await user.click(screen.getByRole('button', { name: 'Save Composition' }));
    expect(onSave).toHaveBeenCalledOnce();
    const arg = onSave.mock.calls[0]![0];
    expect(arg.name).toBe('My Comp');
    expect(arg.mode).toBe('broadcast');
    expect(arg.voices).toHaveLength(1);
    expect(arg.continuationPolicy).toBe('prompt');
  });
});
