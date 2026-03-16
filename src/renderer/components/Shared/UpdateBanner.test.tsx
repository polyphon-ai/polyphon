// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// uiStore calls localStorage.getItem at module initialization time.
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
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import UpdateBanner from './UpdateBanner';
import { useUIStore } from '../../store/uiStore';

const mockGetState = vi.fn();
const mockDismiss = vi.fn();
const mockOnAvailable = vi.fn();
const mockOpenExternal = vi.fn();

beforeEach(() => {
  mockGetState.mockClear().mockResolvedValue(null);
  mockDismiss.mockClear();
  mockOnAvailable.mockClear().mockReturnValue(() => {});
  mockOpenExternal.mockClear();

  (window as any).polyphon = {
    update: {
      getState: mockGetState,
      dismiss: mockDismiss,
      checkNow: vi.fn().mockResolvedValue(null),
      onAvailable: mockOnAvailable,
    },
    shell: { openExternal: mockOpenExternal },
  };

  // Reset store state
  useUIStore.setState({ updateAvailable: null });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('UpdateBanner', () => {
  it('renders nothing when updateAvailable is null', async () => {
    await act(async () => { render(<UpdateBanner />); });
    expect(screen.queryByText(/is available/)).toBeNull();
  });

  it('renders the banner when updateAvailable is set in the store', async () => {
    useUIStore.setState({ updateAvailable: { version: '1.2.3' } });
    await act(async () => { render(<UpdateBanner />); });
    expect(screen.getByText('Polyphon v1.2.3 is available')).toBeTruthy();
  });

  it('calls getState on mount and sets store if update available', async () => {
    mockGetState.mockResolvedValue({ version: '2.0.0' });
    await act(async () => { render(<UpdateBanner />); });
    expect(useUIStore.getState().updateAvailable).toEqual({ version: '2.0.0' });
    expect(screen.getByText('Polyphon v2.0.0 is available')).toBeTruthy();
  });

  it('subscribes to onAvailable and unsubscribes on unmount', async () => {
    const unsubscribe = vi.fn();
    mockOnAvailable.mockReturnValue(unsubscribe);

    const { unmount } = render(<UpdateBanner />);
    await act(async () => {});

    expect(mockOnAvailable).toHaveBeenCalledTimes(1);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('"Remind me later" button calls dismiss(version, false) and clears store', async () => {
    useUIStore.setState({ updateAvailable: { version: '1.2.3' } });
    await act(async () => { render(<UpdateBanner />); });

    fireEvent.click(screen.getByLabelText('Remind me later'));

    expect(mockDismiss).toHaveBeenCalledWith('1.2.3', false);
    expect(useUIStore.getState().updateAvailable).toBeNull();
  });

  it('"Don\'t remind me again" button calls dismiss(version, true) and clears store', async () => {
    useUIStore.setState({ updateAvailable: { version: '1.2.3' } });
    await act(async () => { render(<UpdateBanner />); });

    fireEvent.click(screen.getByText("Don't remind me again"));

    expect(mockDismiss).toHaveBeenCalledWith('1.2.3', true);
    expect(useUIStore.getState().updateAvailable).toBeNull();
  });

  it('"Download" button calls openExternal with the polyphon.ai download URL', async () => {
    useUIStore.setState({ updateAvailable: { version: '1.2.3' } });
    await act(async () => { render(<UpdateBanner />); });

    fireEvent.click(screen.getByText('Download'));

    expect(mockOpenExternal).toHaveBeenCalledWith('https://polyphon.ai/#download');
  });
});
