import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePWAInstall } from './usePWAInstall';

// jsdom doesn't implement matchMedia — provide a mock
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  })),
});

function makeInstallEvent() {
  const promptFn = vi.fn().mockResolvedValue(undefined);
  const userChoice = Promise.resolve({ outcome: 'accepted' as const });
  return Object.assign(new Event('beforeinstallprompt'), {
    prompt: promptFn,
    userChoice,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
});

describe('usePWAInstall', () => {
  it('isInstallable is false before beforeinstallprompt fires', () => {
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.isInstallable).toBe(false);
  });

  it('isInstallable becomes true when beforeinstallprompt fires', () => {
    const { result } = renderHook(() => usePWAInstall());
    act(() => {
      window.dispatchEvent(makeInstallEvent());
    });
    expect(result.current.isInstallable).toBe(true);
  });

  it('isInstalled is false when matchMedia returns false', () => {
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.isInstalled).toBe(false);
  });

  it('isInstalled is true when display-mode: standalone matches', () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query === '(display-mode: standalone)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    }));
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.isInstalled).toBe(true);
  });

  it('isInstalled becomes true after appinstalled fires', () => {
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.isInstalled).toBe(false);
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(result.current.isInstalled).toBe(true);
  });

  it('promptInstall calls prompt() on the deferred event', async () => {
    const fakeEvent = makeInstallEvent();
    const { result } = renderHook(() => usePWAInstall());
    act(() => {
      window.dispatchEvent(fakeEvent);
    });
    await act(async () => {
      await result.current.promptInstall();
    });
    expect(
      (fakeEvent as unknown as { prompt: ReturnType<typeof vi.fn> }).prompt,
    ).toHaveBeenCalled();
  });

  it('isInstallable becomes false after promptInstall is called', async () => {
    const fakeEvent = makeInstallEvent();
    const { result } = renderHook(() => usePWAInstall());
    act(() => {
      window.dispatchEvent(fakeEvent);
    });
    await act(async () => {
      await result.current.promptInstall();
    });
    expect(result.current.isInstallable).toBe(false);
  });

  it('promptInstall is a no-op when no deferred prompt exists', async () => {
    const { result } = renderHook(() => usePWAInstall());
    // Should not throw
    await act(async () => {
      await result.current.promptInstall();
    });
  });

  it('isIOS is false in jsdom (non-iOS userAgent)', () => {
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.isIOS).toBe(false);
  });

  it('calling promptInstall twice only calls prompt() once', async () => {
    const fakeEvent = makeInstallEvent();
    const { result } = renderHook(() => usePWAInstall());
    act(() => {
      window.dispatchEvent(fakeEvent);
    });
    // Call twice without awaiting — second call should be a no-op
    const [p1, p2] = [
      result.current.promptInstall(),
      result.current.promptInstall(),
    ];
    await act(async () => {
      await Promise.all([p1, p2]);
    });
    const mockPrompt = (
      fakeEvent as unknown as { prompt: ReturnType<typeof vi.fn> }
    ).prompt;
    expect(mockPrompt).toHaveBeenCalledTimes(1);
  });

  it('resets after promptInstall rejects so a future call can proceed', async () => {
    const fakeEvent = Object.assign(new Event('beforeinstallprompt'), {
      prompt: vi.fn().mockRejectedValue(new Error('dismissed')),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
    });
    const { result } = renderHook(() => usePWAInstall());
    act(() => {
      window.dispatchEvent(fakeEvent);
    });
    // First call rejects — should not permanently lock
    await act(async () => {
      try {
        await result.current.promptInstall();
      } catch (error) {
        void error;
      }
    });
    // promptingRef should be reset so a second call is not permanently blocked
    // (isInstallable is false because deferredPrompt was cleared, but ref is unlocked)
    // Verify by dispatching a new event and checking isInstallable
    const fakeEvent2 = makeInstallEvent();
    act(() => {
      window.dispatchEvent(fakeEvent2);
    });
    expect(result.current.isInstallable).toBe(true);
  });
});
