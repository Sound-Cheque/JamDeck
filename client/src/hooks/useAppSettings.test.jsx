import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useAppSettings,
  APP_SETTINGS_DEFAULTS,
  APP_SETTINGS_STORAGE_KEY,
} from './useAppSettings.js';

// jsdom in this project's vitest setup ships a localStorage with stubbed
// methods that throw — replace it with an in-memory implementation per test.
function makeLocalStorageStub() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
    key: (i) => Array.from(data.keys())[i] ?? null,
    get length() {
      return data.size;
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeLocalStorageStub());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useAppSettings', () => {
  it('returns defaults when no settings have been persisted', () => {
    const { result } = renderHook(() => useAppSettings());
    expect(result.current.settings).toEqual(APP_SETTINGS_DEFAULTS);
  });

  it('persists changes to localStorage', () => {
    const { result } = renderHook(() => useAppSettings());
    act(() => {
      result.current.setSettings({ fullscreenMode: 'current' });
    });
    expect(result.current.settings.fullscreenMode).toBe('current');
    const stored = JSON.parse(localStorage.getItem(APP_SETTINGS_STORAGE_KEY));
    expect(stored.fullscreenMode).toBe('current');
  });

  it('rehydrates from localStorage on mount', () => {
    localStorage.setItem(
      APP_SETTINGS_STORAGE_KEY,
      JSON.stringify({ fullscreenMode: 'current', theme: 'dark' }),
    );
    const { result } = renderHook(() => useAppSettings());
    expect(result.current.settings).toEqual({
      fullscreenMode: 'current',
      theme: 'dark',
    });
  });

  it('falls back to defaults when stored JSON is corrupt', () => {
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, '{not-json');
    const { result } = renderHook(() => useAppSettings());
    expect(result.current.settings).toEqual(APP_SETTINGS_DEFAULTS);
  });

  it('reacts to a "storage" event from another tab', () => {
    const { result } = renderHook(() => useAppSettings());
    expect(result.current.settings.theme).toBe('auto');

    act(() => {
      localStorage.setItem(
        APP_SETTINGS_STORAGE_KEY,
        JSON.stringify({ theme: 'dark' }),
      );
      window.dispatchEvent(
        new StorageEvent('storage', { key: APP_SETTINGS_STORAGE_KEY }),
      );
    });
    expect(result.current.settings.theme).toBe('dark');
  });
});
