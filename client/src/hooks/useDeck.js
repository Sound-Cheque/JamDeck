import { useCallback, useEffect, useRef, useState } from 'react';

async function readJson(res) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function ensureOk(res, action) {
  if (res.ok) return res;
  const body = await readJson(res).catch(() => null);
  const detail = body?.error ?? `HTTP ${res.status}`;
  throw new Error(`Failed to ${action}: ${detail}`);
}

export function useDeck(id) {
  const [deck, setDeck] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Track the most recent id to discard stale responses if id changes mid-fetch.
  const requestId = useRef(0);

  const load = useCallback(async (targetId) => {
    if (!targetId) {
      setDeck(null);
      setLoading(false);
      setError(null);
      return;
    }
    const ticket = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/decks/${targetId}`);
      await ensureOk(res, 'load deck');
      const body = await readJson(res);
      if (ticket === requestId.current) {
        setDeck(body);
      }
    } catch (err) {
      if (ticket === requestId.current) {
        setError(err.message);
        setDeck(null);
      }
    } finally {
      if (ticket === requestId.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    load(id);
  }, [id, load]);

  const refresh = useCallback(() => load(id), [id, load]);

  const update = useCallback(
    async (patch) => {
      if (!id) throw new Error('No deck loaded');
      const res = await fetch(`/api/decks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      await ensureOk(res, 'update deck');
      const updated = await readJson(res);
      setDeck(updated);
      return updated;
    },
    [id],
  );

  return { deck, loading, error, refresh, update };
}
