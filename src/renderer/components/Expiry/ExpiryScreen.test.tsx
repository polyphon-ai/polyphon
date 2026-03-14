// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ExpiryScreen from './ExpiryScreen';
import type { ExpiryStatus } from '../../../shared/types';

const mockOpenExternal = vi.fn();

beforeAll(() => {
  (window as any).polyphon = {
    expiry: { check: vi.fn() },
    shell: { openExternal: mockOpenExternal },
  };
});

afterEach(() => {
  cleanup();
  mockOpenExternal.mockClear();
});

function makeStatus(overrides: Partial<ExpiryStatus> = {}): ExpiryStatus {
  return {
    expired: true,
    channel: 'alpha',
    version: '0.1.0-alpha.1',
    buildTimestamp: Date.now() - 30 * 24 * 60 * 60 * 1000,
    expiryTimestamp: Date.now() - 1,
    daysRemaining: 0,
    hoursRemaining: 0,
    downloadUrl: 'https://polyphon.ai/#download',
    ...overrides,
  };
}

describe('ExpiryScreen', () => {
  it('renders expired headline', () => {
    render(<ExpiryScreen status={makeStatus()} />);
    expect(screen.getByText('This build has expired')).toBeTruthy();
  });

  it('renders channel badge for alpha', () => {
    render(<ExpiryScreen status={makeStatus({ channel: 'alpha' })} />);
    expect(screen.getByText('Alpha Build')).toBeTruthy();
  });

  it('renders channel badge for beta', () => {
    render(<ExpiryScreen status={makeStatus({ channel: 'beta' })} />);
    expect(screen.getByText('Beta Build')).toBeTruthy();
  });

  it('download button calls shell.openExternal with the download URL', () => {
    const url = 'https://polyphon.ai/#download';
    render(<ExpiryScreen status={makeStatus({ downloadUrl: url })} />);
    fireEvent.click(screen.getByText('Download the latest build →'));
    expect(mockOpenExternal).toHaveBeenCalledWith(url);
  });
});
