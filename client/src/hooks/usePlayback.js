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
      case 'playback:pending':
        setState((prev) => ({
          state: 'pending',
          deckId: msg.deckId,
          ...(prev.linkBpm != null ? { linkBpm: prev.linkBpm } : {}),
        }));
        break;
      case 'playback:start':
        setState((prev) => {
          // Carry linkBpm forward — it persists across slide advances. Prefer
          // a freshly-broadcast linkBpm; otherwise keep whatever the live
          // 'link:tempo' stream gave us. Only include the key when we have a
          // value, so non-Link sessions stay schema-clean.
          const linkBpm = msg.linkBpm ?? prev.linkBpm ?? null;
          const next = {
            state: 'playing',
            deckId: msg.deckId,
            slideIndex: msg.slideIndex,
            startedAt: msg.startedAt,
            loop: !!msg.loop,
          };
          if (linkBpm != null) next.linkBpm = linkBpm;
          return next;
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
        // Preserve linkBpm across stop — the Link tempo is independent of
        // playback state and the next start will pick it up.
        setState((prev) =>
          prev.linkBpm != null ? { ...IDLE, linkBpm: prev.linkBpm } : IDLE,
        );
        break;
      case 'link:tempo':
        setState((prev) => ({ ...prev, linkBpm: msg.bpm }));
        break;
      case 'link:peers':
        setState((prev) => ({ ...prev, linkPeers: msg.numPeers }));
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
