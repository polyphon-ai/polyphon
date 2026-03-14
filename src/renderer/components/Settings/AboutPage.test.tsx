// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import AboutPage from './AboutPage';
import type { ExpiryStatus } from '../../../shared/types';

beforeAll(() => {
  (window as any).polyphon = {
    shell: { openExternal: vi.fn() },
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const FIXED_NOW = 1_700_000_000_000; // fixed epoch ms for deterministic tests

function makeStatus(overrides: Partial<ExpiryStatus> = {}): ExpiryStatus {
  return {
    expired: false,
    channel: 'alpha',
    version: '0.1.0-alpha.1',
    buildTimestamp: FIXED_NOW - 10 * 24 * 60 * 60 * 1000,
    expiryTimestamp: FIXED_NOW + 18 * 24 * 60 * 60 * 1000,
    daysRemaining: 18,
    hoursRemaining: 18 * 24,
    downloadUrl: 'https://polyphon.ai/#download',
    ...overrides,
  };
}

describe('AboutPage', () => {
  it('shows loading state when status is null', () => {
    render(<AboutPage status={null} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('shows release text and no countdown card for release channel', () => {
    render(<AboutPage status={makeStatus({ channel: 'release', expired: false, daysRemaining: Infinity, hoursRemaining: Infinity })} />);
    expect(screen.getByText("You're running a release build.")).toBeTruthy();
    expect(screen.queryByText('Alpha Build')).toBeNull();
    expect(screen.queryByText('Beta Build')).toBeNull();
  });

  it('shows days when >= 2 days remaining', () => {
    // Fix Date.now() so Countdown and the test agree on the reference time
    vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    const status = makeStatus({
      channel: 'alpha',
      expiryTimestamp: FIXED_NOW + 5 * 24 * 60 * 60 * 1000,
    });
    render(<AboutPage status={status} />);
    // Countdown: 5 days remaining → showHours=false → shows days
    expect(screen.getByText('5 days')).toBeTruthy();
  });

  it('shows hours when < 2 days remaining', () => {
    vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    const status = makeStatus({
      channel: 'alpha',
      expiryTimestamp: FIXED_NOW + 25 * 60 * 60 * 1000,
    });
    render(<AboutPage status={status} />);
    // Countdown: 25 hours remaining → days=1, showHours=true → shows hours
    expect(screen.getByText('25 hours')).toBeTruthy();
  });
});
