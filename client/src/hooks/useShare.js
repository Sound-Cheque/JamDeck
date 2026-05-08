// Owns the share-tunnel state on the host. Hydrates from /api/share on mount,
// exposes start() and stop() imperative actions. Errors from the server bubble
// up through `error`; the UI surfaces them next to the button.

import { useCallback, useEffect, useState } from 'react';

export function useShare() {
  const [status, setStatus] = useState({ active: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/share')
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled && body) setStatus(body);
      })
      .catch(() => {
        /* leave status at default on initial-load failure */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/share/start', { method: 'POST' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? `Failed to start share (HTTP ${res.status})`);
      }
      setStatus(body);
      return body;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  const stop = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/share/stop', { method: 'POST' });
      const body = await res.json().catch(() => null);
      if (res.ok && body) setStatus(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, busy, error, start, stop };
}
