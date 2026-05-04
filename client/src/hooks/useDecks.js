import { useCallback, useEffect, useState } from 'react';

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

export function useDecks() {
  const [decks, setDecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/decks');
      await ensureOk(res, 'load decks');
      setDecks(await readJson(res));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createDeck = useCallback(async (name) => {
    const res = await fetch('/api/decks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    await ensureOk(res, 'create deck');
    const created = await readJson(res);
    setDecks((prev) => [...prev, summarize(created)]);
    return created;
  }, []);

  const deleteDeck = useCallback(async (id) => {
    const res = await fetch(`/api/decks/${id}`, { method: 'DELETE' });
    await ensureOk(res, 'delete deck');
    setDecks((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const toggleFavorite = useCallback(async (id) => {
    const res = await fetch(`/api/decks/${id}/favorite`, { method: 'POST' });
    await ensureOk(res, 'toggle favorite');
    const updated = await readJson(res);
    setDecks((prev) => prev.map((d) => (d.id === id ? summarize(updated) : d)));
    return updated;
  }, []);

  return { decks, loading, error, refresh, createDeck, deleteDeck, toggleFavorite };
}

function summarize(deck) {
  return {
    id: deck.id,
    name: deck.name,
    favorite: deck.favorite,
    createdAt: deck.createdAt,
    updatedAt: deck.updatedAt,
    slideCount: deck.slides?.length ?? 0,
  };
}
