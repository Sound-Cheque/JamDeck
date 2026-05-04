import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useDecks } from './useDecks.js';

let fetchMock;

function summary(overrides = {}) {
  return {
    id: overrides.id ?? '11111111-1111-1111-1111-111111111111',
    name: overrides.name ?? 'A Deck',
    favorite: overrides.favorite ?? false,
    createdAt: overrides.createdAt ?? '2026-05-04T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-05-04T00:00:00.000Z',
    slideCount: overrides.slideCount ?? 0,
  };
}

function fullDeck(overrides = {}) {
  return {
    ...summary(overrides),
    settings: {
      timingMode: 'duration',
      internalBpm: 120,
      metronomeSounds: { accent: null, beat: null },
      timerStyle: 'backgroundFill',
      countdownBars: 2,
      countdownSeconds: 5,
      loop: false,
      showSlideStrip: true,
    },
    slides: [],
  };
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function emptyResponse(status = 204) {
  return new Response(null, { status });
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useDecks', () => {
  it('starts in a loading state and resolves to an empty list', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    const { result } = renderHook(() => useDecks());

    expect(result.current.loading).toBe(true);
    expect(result.current.decks).toEqual([]);
    expect(result.current.error).toBeNull();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.decks).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith('/api/decks');
  });

  it('loads existing decks on mount', async () => {
    const a = summary({ id: 'a', name: 'Alpha' });
    const b = summary({ id: 'b', name: 'Beta' });
    fetchMock.mockResolvedValueOnce(jsonResponse([a, b]));

    const { result } = renderHook(() => useDecks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.decks).toEqual([a, b]);
  });

  it('exposes an error message when the initial load fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'kaboom' }, { status: 500 }));

    const { result } = renderHook(() => useDecks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toMatch(/load/i);
    expect(result.current.decks).toEqual([]);
  });

  it('createDeck POSTs to /api/decks and appends the new deck', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    const newDeck = fullDeck({ id: 'new', name: 'Created' });
    fetchMock.mockResolvedValueOnce(jsonResponse(newDeck, { status: 201 }));

    const { result } = renderHook(() => useDecks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned;
    await act(async () => {
      returned = await result.current.createDeck('Created');
    });

    expect(returned.id).toBe('new');
    expect(result.current.decks).toHaveLength(1);
    expect(result.current.decks[0].id).toBe('new');

    const [, postCall] = fetchMock.mock.calls;
    expect(postCall[0]).toBe('/api/decks');
    expect(postCall[1].method).toBe('POST');
    expect(JSON.parse(postCall[1].body)).toEqual({ name: 'Created' });
    expect(postCall[1].headers['Content-Type']).toBe('application/json');
  });

  it('deleteDeck DELETEs and removes from the list', async () => {
    const a = summary({ id: 'a', name: 'Alpha' });
    const b = summary({ id: 'b', name: 'Beta' });
    fetchMock.mockResolvedValueOnce(jsonResponse([a, b]));
    fetchMock.mockResolvedValueOnce(emptyResponse(204));

    const { result } = renderHook(() => useDecks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteDeck('a');
    });

    expect(result.current.decks).toEqual([b]);
    const [, deleteCall] = fetchMock.mock.calls;
    expect(deleteCall[0]).toBe('/api/decks/a');
    expect(deleteCall[1].method).toBe('DELETE');
  });

  it('toggleFavorite POSTs and replaces the deck summary', async () => {
    const a = summary({ id: 'a', name: 'Alpha', favorite: false });
    fetchMock.mockResolvedValueOnce(jsonResponse([a]));
    const updated = fullDeck({ id: 'a', name: 'Alpha', favorite: true });
    fetchMock.mockResolvedValueOnce(jsonResponse(updated));

    const { result } = renderHook(() => useDecks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggleFavorite('a');
    });

    expect(result.current.decks[0].favorite).toBe(true);
    const [, favCall] = fetchMock.mock.calls;
    expect(favCall[0]).toBe('/api/decks/a/favorite');
    expect(favCall[1].method).toBe('POST');
  });

  it('refresh() re-fetches the list', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    const a = summary({ id: 'a', name: 'Alpha' });
    fetchMock.mockResolvedValueOnce(jsonResponse([a]));

    const { result } = renderHook(() => useDecks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.decks).toEqual([a]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
