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

  const addSlide = useCallback(
    async (partial = {}) => {
      if (!id) throw new Error('No deck loaded');
      const res = await fetch(`/api/decks/${id}/slides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      });
      await ensureOk(res, 'add slide');
      const updated = await readJson(res);
      setDeck(updated);
      return updated;
    },
    [id],
  );

  const updateSlide = useCallback(
    async (slideId, patch) => {
      if (!id) throw new Error('No deck loaded');
      const res = await fetch(`/api/decks/${id}/slides/${slideId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      await ensureOk(res, 'update slide');
      const updated = await readJson(res);
      setDeck(updated);
      return updated;
    },
    [id],
  );

  const deleteSlide = useCallback(
    async (slideId) => {
      if (!id) throw new Error('No deck loaded');
      const res = await fetch(`/api/decks/${id}/slides/${slideId}`, { method: 'DELETE' });
      await ensureOk(res, 'delete slide');
      const updated = await readJson(res);
      setDeck(updated);
      return updated;
    },
    [id],
  );

  const reorderSlides = useCallback(
    async (orderedIds) => {
      if (!id) throw new Error('No deck loaded');
      const res = await fetch(`/api/decks/${id}/slides/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: orderedIds }),
      });
      await ensureOk(res, 'reorder slides');
      const updated = await readJson(res);
      setDeck(updated);
      return updated;
    },
    [id],
  );

  return {
    deck,
    loading,
    error,
    refresh,
    update,
    addSlide,
    updateSlide,
    deleteSlide,
    reorderSlides,
  };
}
