import { useCallback, useEffect, useState } from 'react';

const IDLE = { state: 'idle' };

// Owns the playback state on the client. Hydrates from GET /api/playback on
// mount, then `handleMessage` (called by the App's WebSocket handler) keeps
// it in sync via playback:start / playback:slide / playback:stop messages.
// `start` / `stop` are imperative actions that drive the server.
export function usePlayback() {
  const [state, setState] = useState(IDLE);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/playback')
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled && body) setState(body);
      })
      .catch(() => {
        /* leave state idle on initial-load failure */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleMessage = useCallback((msg) => {
    switch (msg?.type) {
      case 'playback:start':
        setState({
          state: 'playing',
          deckId: msg.deckId,
          slideIndex: msg.slideIndex,
          startedAt: msg.startedAt,
          loop: !!msg.loop,
        });
        break;
      case 'playback:slide':
        setState((prev) =>
          prev.state === 'playing'
            ? { ...prev, slideIndex: msg.slideIndex, startedAt: msg.startedAt }
            : prev,
        );
        break;
      case 'playback:stop':
        setState(IDLE);
        break;
      default:
        break;
    }
  }, []);

  const start = useCallback(async (deckId) => {
    const res = await fetch('/api/playback/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deckId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `Failed to start playback (HTTP ${res.status})`);
    }
    return res.json();
  }, []);

  const stop = useCallback(async () => {
    await fetch('/api/playback/stop', { method: 'POST' });
  }, []);

  return { state, handleMessage, start, stop };
}
