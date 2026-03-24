// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ApiSection from './ApiSection';
import type { ApiStatus } from '../../../shared/types';

const FAKE_TOKEN = 'a'.repeat(56) + 'abcd1234';

const makeStatus = (overrides: Partial<ApiStatus> = {}): ApiStatus => ({
  enabled: false,
  remoteAccessEnabled: false,
  running: false,
  port: 7432,
  host: '127.0.0.1',
  tokenFingerprint: 'abcd1234',
  version: '0.0.0-test',
  activeConnections: 0,
  ...overrides,
});

function setupMocks(status: ApiStatus) {
  const onStatusChanged = vi.fn().mockReturnValue(() => {});
  (window as any).polyphon = {
    api: {
      getStatus: vi.fn().mockResolvedValue(status),
      getToken: vi.fn().mockResolvedValue(FAKE_TOKEN),
      setEnabled: vi.fn().mockResolvedValue({ ...status, enabled: !status.enabled, running: !status.enabled }),
      setRemoteAccess: vi.fn().mockResolvedValue({ ...status, remoteAccessEnabled: !status.remoteAccessEnabled }),
      rotateToken: vi.fn().mockResolvedValue({ ...status, tokenFingerprint: 'newfingerprint' }),
      onStatusChanged,
    },
  };
}

afterEach(() => { cleanup(); });

describe('ApiSection', () => {
  beforeEach(() => {
    setupMocks(makeStatus());
  });

  it('shows loading text initially when promise is pending', async () => {
    (window as any).polyphon.api.getStatus = () => new Promise(() => {});
    render(<ApiSection />);
    expect(screen.queryByText(/Loading API status/i)).not.toBeNull();
  });

  it('shows toggle in disabled state when not enabled', async () => {
    render(<ApiSection />);
    await waitFor(() => {
      expect(screen.getAllByRole('switch').length).toBeGreaterThan(0);
    });
    const toggle = screen.getAllByRole('switch')[0]!;
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('calls setEnabled when toggle is clicked', async () => {
    const user = userEvent.setup();
    render(<ApiSection />);
    await waitFor(() => {
      expect(screen.getAllByRole('switch').length).toBeGreaterThan(0);
    });
    await user.click(screen.getAllByRole('switch')[0]!);
    expect((window as any).polyphon.api.setEnabled).toHaveBeenCalledWith(true);
  });

  it('shows remote access toggle and TLS warning when enabled with remoteAccess', async () => {
    setupMocks(makeStatus({ enabled: true, running: true, remoteAccessEnabled: true }));
    render(<ApiSection />);
    await waitFor(() => {
      expect(screen.getAllByRole('switch').length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.queryAllByText(/TLS/i).length).toBeGreaterThan(0);
  });

  it('shows TLS warning whenever remoteAccessEnabled=true (not only during toggle interaction)', async () => {
    setupMocks(makeStatus({ enabled: true, remoteAccessEnabled: true }));
    render(<ApiSection />);
    await waitFor(() => {
      expect(screen.queryAllByText(/TLS/i).length).toBeGreaterThan(0);
    });
  });

  it('does not show API Key section when disabled', async () => {
    render(<ApiSection />);
    await waitFor(() => {
      expect(screen.getAllByRole('switch').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/^API Key$/)).toBeNull();
  });

  it('shows API Key section when enabled', async () => {
    setupMocks(makeStatus({ enabled: true }));
    render(<ApiSection />);
    await waitFor(() => {
      expect(screen.queryByText(/^API Key$/)).not.toBeNull();
    });
  });

  it('shows token value (masked) when enabled', async () => {
    setupMocks(makeStatus({ enabled: true }));
    render(<ApiSection />);
    await waitFor(() => {
      // Last 8 chars of token are shown even when masked
      expect(screen.queryByText(/abcd1234/)).not.toBeNull();
    });
  });

  it('shows startup error when present', async () => {
    setupMocks(makeStatus({ enabled: true, startupError: 'Port 7432 is already in use' }));
    render(<ApiSection />);
    await waitFor(() => {
      expect(screen.queryByText(/Port 7432 is already in use/i)).not.toBeNull();
    });
  });

  it('shows running status with host and port', async () => {
    setupMocks(makeStatus({ enabled: true, running: true, port: 7432 }));
    render(<ApiSection />);
    await waitFor(() => {
      expect(screen.queryByText(/127\.0\.0\.1:7432/)).not.toBeNull();
    });
  });

  it('shows poly CLI install instructions', async () => {
    render(<ApiSection />);
    await waitFor(() => {
      expect(screen.queryByText(/npm install -g @polyphon-ai\/poly/i)).not.toBeNull();
    });
  });
});
