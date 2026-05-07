import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNow } from './useNow.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useNow', () => {
  it('returns the current time on mount', () => {
    const { result } = renderHook(() => useNow(100));
    expect(result.current).toBe(new Date('2026-01-01T00:00:00.000Z').getTime());
  });

  it('updates after the configured interval', () => {
    const { result } = renderHook(() => useNow(100));
    const initial = result.current;

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current).toBeGreaterThan(initial);
    expect(result.current - initial).toBe(100);
  });

  it('does not tick after unmount', () => {
    const { result, unmount } = renderHook(() => useNow(100));
    const before = result.current;
    unmount();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(result.current).toBe(before);
  });
});
