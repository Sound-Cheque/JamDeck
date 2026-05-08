// Host-only app preferences persisted to localStorage. Currently just one
// setting — fullscreen mode — but the shape generalises to whatever we add
// later (theme, keyboard layout, etc.).
//
// Default fullscreen mode is 'window' (open the playback in a new browser
// window) because that's the projector-friendly path; users with a single
// monitor can flip to 'current' which uses the Fullscreen API.

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'jam-deck:app-settings:v1';

const DEFAULTS = {
  fullscreenMode: 'window', // 'window' | 'current'
  theme: 'auto', // 'auto' | 'light' | 'dark'
};

function readFromStorage() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function writeToStorage(value) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* quota / privacy mode — we just lose persistence */
  }
}

export function useAppSettings() {
  const [settings, setSettingsState] = useState(readFromStorage);

  // Listen for cross-tab updates. Keeps the host editor and a popped-out
  // playback window in sync if the user toggles theme or fullscreen pref.
  useEffect(() => {
    function onStorage(e) {
      if (e.key !== STORAGE_KEY) return;
      setSettingsState(readFromStorage());
    }
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setSettings = useCallback((patch) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      writeToStorage(next);
      return next;
    });
  }, []);

  return { settings, setSettings };
}

// Exposed for tests so they can assert against / reset the canonical defaults.
export const APP_SETTINGS_DEFAULTS = DEFAULTS;
export const APP_SETTINGS_STORAGE_KEY = STORAGE_KEY;
