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

  it('addSlide() POSTs and updates the local deck', async () => {
    const deck = fullDeck({ id: 'a', slides: [] });
    fetchMock.mockResolvedValueOnce(jsonResponse(deck));
    const withSlide = {
      ...deck,
      slides: [{ id: 's1', type: 'canvas', duration: { unit: 'seconds', value: 30 }, content: { objects: [], background: '#ffffff' } }],
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(withSlide, { status: 201 }));

    const { result } = renderHook(() => useDeck('a'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned;
    await act(async () => {
      returned = await result.current.addSlide();
    });

    expect(returned).toEqual(withSlide);
    expect(result.current.deck).toEqual(withSlide);

    const [, postCall] = fetchMock.mock.calls;
    expect(postCall[0]).toBe('/api/decks/a/slides');
    expect(postCall[1].method).toBe('POST');
  });

  it('updateSlide() PATCHes the slide endpoint and updates local state', async () => {
    const deck = fullDeck({
      id: 'a',
      slides: [{ id: 's1', type: 'canvas', duration: { unit: 'seconds', value: 30 }, content: { objects: [], background: '#ffffff' } }],
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(deck));
    const updated = { ...deck, slides: [{ ...deck.slides[0], duration: { unit: 'seconds', value: 60 } }] };
    fetchMock.mockResolvedValueOnce(jsonResponse(updated));

    const { result } = renderHook(() => useDeck('a'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateSlide('s1', { duration: { unit: 'seconds', value: 60 } });
    });

    expect(result.current.deck.slides[0].duration.value).toBe(60);

    const [, patchCall] = fetchMock.mock.calls;
    expect(patchCall[0]).toBe('/api/decks/a/slides/s1');
    expect(patchCall[1].method).toBe('PATCH');
    expect(JSON.parse(patchCall[1].body)).toEqual({ duration: { unit: 'seconds', value: 60 } });
  });

  it('deleteSlide() DELETEs and updates local state', async () => {
    const deck = fullDeck({
      id: 'a',
      slides: [{ id: 's1', type: 'canvas', duration: { unit: 'seconds', value: 30 }, content: {} }],
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(deck));
    const after = { ...deck, slides: [] };
    fetchMock.mockResolvedValueOnce(jsonResponse(after));

    const { result } = renderHook(() => useDeck('a'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteSlide('s1');
    });

    expect(result.current.deck.slides).toEqual([]);

    const [, deleteCall] = fetchMock.mock.calls;
    expect(deleteCall[0]).toBe('/api/decks/a/slides/s1');
    expect(deleteCall[1].method).toBe('DELETE');
  });

  it('reorderSlides() PUTs the order array and updates local state', async () => {
    const slide = (id) => ({ id, type: 'canvas', duration: { unit: 'seconds', value: 30 }, content: {} });
    const deck = fullDeck({ id: 'a', slides: [slide('s1'), slide('s2'), slide('s3')] });
    fetchMock.mockResolvedValueOnce(jsonResponse(deck));
    const reordered = { ...deck, slides: [slide('s3'), slide('s1'), slide('s2')] };
    fetchMock.mockResolvedValueOnce(jsonResponse(reordered));

    const { result } = renderHook(() => useDeck('a'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.reorderSlides(['s3', 's1', 's2']);
    });

    expect(result.current.deck.slides.map((s) => s.id)).toEqual(['s3', 's1', 's2']);

    const [, putCall] = fetchMock.mock.calls;
    expect(putCall[0]).toBe('/api/decks/a/slides/order');
    expect(putCall[1].method).toBe('PUT');
    expect(JSON.parse(putCall[1].body)).toEqual({ order: ['s3', 's1', 's2'] });
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
