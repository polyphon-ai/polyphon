// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import AboutPage from './AboutPage';

beforeAll(() => {
  (globalThis as any).__APP_VERSION__ = '0.0.0-test';
  (window as any).polyphon = {
    shell: { openExternal: vi.fn() },
    update: {
      checkNow: vi.fn().mockResolvedValue(null),
      download: vi.fn().mockResolvedValue(undefined),
      install: vi.fn().mockResolvedValue(undefined),
      getChannel: vi.fn().mockResolvedValue('stable'),
      setChannel: vi.fn().mockResolvedValue(undefined),
    },
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AboutPage', () => {
  it('renders the Polyphon wordmark images', () => {
    render(<AboutPage />);
    const images = screen.getAllByAltText('Polyphon');
    expect(images.length).toBeGreaterThan(0);
  });

  it('renders the version badge', () => {
    render(<AboutPage />);
    expect(screen.getByText('v0.0.0-test')).toBeTruthy();
  });

  it('renders community links', () => {
    render(<AboutPage />);
    expect(screen.getByText('File a bug')).toBeTruthy();
    expect(screen.getByText('Request a feature')).toBeTruthy();
  });
});
