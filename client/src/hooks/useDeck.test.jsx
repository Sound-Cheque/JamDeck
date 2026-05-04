import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useDeck } from './useDeck.js';

let fetchMock;

function fullDeck(overrides = {}) {
  return {
    id: overrides.id ?? 'a',
    name: overrides.name ?? 'Deck A',
    favorite: overrides.favorite ?? false,
    createdAt: '2026-05-04T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-05-04T00:00:00.000Z',
    settings: overrides.settings ?? {
      timingMode: 'duration',
      internalBpm: 120,
      metronomeSounds: { accent: null, beat: null },
      timerStyle: 'backgroundFill',
      countdownBars: 2,
      countdownSeconds: 5,
      loop: false,
      showSlideStrip: true,
    },
    slides: overrides.slides ?? [],
  };
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useDeck', () => {
  it('does nothing when id is null', () => {
    const { result } = renderHook(() => useDeck(null));
    expect(result.current.deck).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches the full deck when given an id', async () => {
    const deck = fullDeck({ id: 'a', name: 'Loaded' });
    fetchMock.mockResolvedValueOnce(jsonResponse(deck));

    const { result } = renderHook(() => useDeck('a'));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.deck).toEqual(deck);
    expect(fetchMock).toHaveBeenCalledWith('/api/decks/a');
  });

  it('surfaces a load error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, { status: 500 }));

    const { result } = renderHook(() => useDeck('a'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toMatch(/load/i);
    expect(result.current.deck).toBeNull();
  });

  it('refetches when the id changes', async () => {
    const deckA = fullDeck({ id: 'a', name: 'A' });
    const deckB = fullDeck({ id: 'b', name: 'B' });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(deckA))
      .mockResolvedValueOnce(jsonResponse(deckB));

    const { result, rerender } = renderHook(({ id }) => useDeck(id), {
      initialProps: { id: 'a' },
    });
    await waitFor(() => expect(result.current.deck?.id).toBe('a'));

    rerender({ id: 'b' });
    await waitFor(() => expect(result.current.deck?.id).toBe('b'));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/decks/a');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/decks/b');
  });

  it('clears the deck when id becomes null', async () => {
    const deck = fullDeck({ id: 'a' });
    fetchMock.mockResolvedValueOnce(jsonResponse(deck));

    const { result, rerender } = renderHook(({ id }) => useDeck(id), {
      initialProps: { id: 'a' },
    });
    await waitFor(() => expect(result.current.deck?.id).toBe('a'));

    rerender({ id: null });
    await waitFor(() => expect(result.current.deck).toBeNull());
    expect(result.current.loading).toBe(false);
  });

  it('update() PATCHes and replaces the local deck with the response', async () => {
    const deck = fullDeck({ id: 'a' });
    fetchMock.mockResolvedValueOnce(jsonResponse(deck));
    const updated = fullDeck({
      id: 'a',
      settings: { ...deck.settings, internalBpm: 90 },
      updatedAt: '2026-05-05T00:00:00.000Z',
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(updated));

    const { result } = renderHook(() => useDeck('a'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned;
    await act(async () => {
      returned = await result.current.update({ settings: { internalBpm: 90 } });
    });

    expect(returned).toEqual(updated);
    expect(result.current.deck).toEqual(updated);

    const [, patchCall] = fetchMock.mock.calls;
    expect(patchCall[0]).toBe('/api/decks/a');
    expect(patchCall[1].method).toBe('PATCH');
    expect(JSON.parse(patchCall[1].body)).toEqual({ settings: { internalBpm: 90 } });
    expect(patchCall[1].headers['Content-Type']).toBe('application/json');
  });

  it('refresh() re-fetches the same id', async () => {
    const deckV1 = fullDeck({ id: 'a', name: 'v1' });
    const deckV2 = fullDeck({ id: 'a', name: 'v2' });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(deckV1))
      .mockResolvedValueOnce(jsonResponse(deckV2));

    const { result } = renderHook(() => useDeck('a'));
    await waitFor(() => expect(result.current.deck?.name).toBe('v1'));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.deck?.name).toBe('v2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
