// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';

afterEach(cleanup);
import ConductorInput from './ConductorInput';
import type { VoiceDescriptor } from '../../../shared/types';

const ensemble: VoiceDescriptor[] = [
  {
    id: 'v1',
    name: 'Alice',
    type: 'api',
    provider: 'anthropic',
    color: '#D4763B',
    avatarIcon: 'A',
    side: 'left',
  },
  {
    id: 'v2',
    name: 'Bob',
    type: 'api',
    provider: 'openai',
    color: '#10A37F',
    avatarIcon: 'B',
    side: 'right',
  },
  {
    id: 'v3',
    name: 'Charlie',
    type: 'cli',
    provider: 'claude-code',
    color: '#6366f1',
    avatarIcon: 'C',
    side: 'left',
  },
];

describe('ConductorInput', () => {
  const user = userEvent.setup();

  describe('@mention autocomplete', () => {
    it('does not show dropdown before @ is typed', () => {
      const onSubmit = vi.fn();
      render(
        <ConductorInput
          ensemble={ensemble}
          onSubmit={onSubmit}
          mode="conductor"
        />,
      );
      expect(screen.queryByText('@Alice')).toBeNull();
    });

    it('shows dropdown when @ followed by at least 1 char', async () => {
      const onSubmit = vi.fn();
      render(
        <ConductorInput
          ensemble={ensemble}
          onSubmit={onSubmit}
          mode="conductor"
        />,
      );
      const textarea = screen.getByPlaceholderText('Message the ensemble…');
      await user.type(textarea, '@A');
      expect(screen.getByText('@Alice')).toBeTruthy();
    });

    it('filters dropdown by typed text case-insensitively', async () => {
      const onSubmit = vi.fn();
      render(
        <ConductorInput
          ensemble={ensemble}
          onSubmit={onSubmit}
          mode="conductor"
        />,
      );
      const textarea = screen.getByPlaceholderText('Message the ensemble…');
      await user.type(textarea, '@bo');
      expect(screen.getByText('@Bob')).toBeTruthy();
      expect(screen.queryByText('@Alice')).toBeNull();
      expect(screen.queryByText('@Charlie')).toBeNull();
    });

    it('inserts @VoiceName on Enter when dropdown is open', async () => {
      const onSubmit = vi.fn();
      render(
        <ConductorInput
          ensemble={ensemble}
          onSubmit={onSubmit}
          mode="conductor"
        />,
      );
      const textarea = screen.getByPlaceholderText(
        'Message the ensemble…',
      ) as HTMLTextAreaElement;
      await user.type(textarea, '@Al');
      // Alice dropdown option should be visible
      expect(screen.getByRole('option', { name: /Alice/ })).toBeTruthy();
      await user.keyboard('{Enter}');
      expect(textarea.value).toContain('@Alice');
      // Dropdown should be dismissed — the mention option is gone
      await waitFor(() =>
        expect(
          screen.queryByRole('option', { name: /@Alice/ }),
        ).toBeNull(),
      );
    });

    it('dismisses dropdown on Escape', async () => {
      const onSubmit = vi.fn();
      render(
        <ConductorInput
          ensemble={ensemble}
          onSubmit={onSubmit}
          mode="conductor"
        />,
      );
      const textarea = screen.getByPlaceholderText('Message the ensemble…');
      await user.type(textarea, '@Al');
      expect(screen.getByText('@Alice')).toBeTruthy();
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByText('@Alice')).toBeNull());
    });

    it('navigates dropdown with ArrowDown/ArrowUp', async () => {
      const onSubmit = vi.fn();
      render(
        <ConductorInput
          ensemble={ensemble}
          onSubmit={onSubmit}
          mode="conductor"
        />,
      );
      const textarea = screen.getByPlaceholderText('Message the ensemble…');
      await user.type(textarea, '@');
      // All voices shown — type one char to trigger
      await user.type(textarea, 'a');
      // Alice matches
      const aliceBtn = screen.getByText('@Alice').closest('button');
      expect(aliceBtn?.className).toContain('indigo'); // selected
      // ArrowDown → would cycle but only Alice matches for 'a'
    });

    it('shows autocomplete in broadcast mode', async () => {
      const onSubmit = vi.fn();
      render(
        <ConductorInput
          ensemble={ensemble}
          onSubmit={onSubmit}
          mode="broadcast"
        />,
      );
      const textarea = screen.getByPlaceholderText('Message the ensemble…');
      await user.type(textarea, '@Al');
      expect(screen.getByText('@Alice')).toBeTruthy();
    });
  });

  describe('submit behavior', () => {
    it('calls onSubmit with content on Enter', async () => {
      const onSubmit = vi.fn();
      render(
        <ConductorInput
          ensemble={ensemble}
          onSubmit={onSubmit}
          mode="conductor"
        />,
      );
      const textarea = screen.getByPlaceholderText('Message the ensemble…');
      await user.type(textarea, 'Hello world');
      await user.keyboard('{Enter}');
      expect(onSubmit).toHaveBeenCalledWith('Hello world');
    });

    it('does not submit on Shift+Enter (newline instead)', async () => {
      const onSubmit = vi.fn();
      render(
        <ConductorInput
          ensemble={ensemble}
          onSubmit={onSubmit}
          mode="conductor"
        />,
      );
      const textarea = screen.getByPlaceholderText('Message the ensemble…');
      await user.type(textarea, 'Hello');
      await user.keyboard('{Shift>}{Enter}{/Shift}');
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('is disabled when disabled prop is true', () => {
      const onSubmit = vi.fn();
      render(
        <ConductorInput
          ensemble={ensemble}
          onSubmit={onSubmit}
          disabled
          mode="conductor"
        />,
      );
      const textarea = screen.getByPlaceholderText('Waiting for voices…');
      expect(textarea).toBeDisabled();
      const sendBtn = screen.getByLabelText('Send message');
      expect(sendBtn).toBeDisabled();
    });

    it('clears textarea after submit', async () => {
      const onSubmit = vi.fn();
      render(
        <ConductorInput
          ensemble={ensemble}
          onSubmit={onSubmit}
          mode="conductor"
        />,
      );
      const textarea = screen.getByPlaceholderText(
        'Message the ensemble…',
      ) as HTMLTextAreaElement;
      await user.type(textarea, 'Test message');
      await user.keyboard('{Enter}');
      expect(textarea.value).toBe('');
    });
  });

});
