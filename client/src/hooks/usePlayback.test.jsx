import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePlayback } from './usePlayback.js';

let fetchMock;

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

describe('usePlayback', () => {
  it('fetches initial state from /api/playback on mount', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ state: 'idle' }));

    const { result } = renderHook(() => usePlayback());

    await waitFor(() => expect(result.current.state.state).toBe('idle'));
    expect(fetchMock).toHaveBeenCalledWith('/api/playback');
  });

  it('hydrates with a playing state if the server returns one', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        state: 'playing',
        deckId: 'deck-1',
        slideIndex: 1,
        startedAt: '2026-01-01T00:00:00.000Z',
        loop: false,
      }),
    );

    const { result } = renderHook(() => usePlayback());

    await waitFor(() => expect(result.current.state.state).toBe('playing'));
    expect(result.current.state.deckId).toBe('deck-1');
    expect(result.current.state.slideIndex).toBe(1);
  });

  it('reacts to playback:start messages by switching to playing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ state: 'idle' }));
    const { result } = renderHook(() => usePlayback());
    await waitFor(() => expect(result.current.state.state).toBe('idle'));

    act(() => {
      result.current.handleMessage({
        type: 'playback:start',
        deckId: 'd1',
        slideIndex: 0,
        startedAt: '2026-01-01T00:00:00.000Z',
        loop: true,
      });
    });

    expect(result.current.state).toEqual({
      state: 'playing',
      deckId: 'd1',
      slideIndex: 0,
      startedAt: '2026-01-01T00:00:00.000Z',
      loop: true,
    });
  });

  it('reacts to playback:slide by updating slideIndex and startedAt only', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        state: 'playing',
        deckId: 'd',
        slideIndex: 0,
        startedAt: '2026-01-01T00:00:00.000Z',
        loop: false,
      }),
    );
    const { result } = renderHook(() => usePlayback());
    await waitFor(() => expect(result.current.state.state).toBe('playing'));

    act(() => {
      result.current.handleMessage({
        type: 'playback:slide',
        slideIndex: 1,
        startedAt: '2026-01-01T00:00:30.000Z',
      });
    });

    expect(result.current.state.slideIndex).toBe(1);
    expect(result.current.state.startedAt).toBe('2026-01-01T00:00:30.000Z');
    expect(result.current.state.deckId).toBe('d'); // preserved
  });

  it('ignores playback:slide while idle', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ state: 'idle' }));
    const { result } = renderHook(() => usePlayback());
    await waitFor(() => expect(result.current.state.state).toBe('idle'));

    act(() => {
      result.current.handleMessage({
        type: 'playback:slide',
        slideIndex: 1,
        startedAt: '2026-01-01T00:00:30.000Z',
      });
    });

    expect(result.current.state.state).toBe('idle');
  });

  it('reacts to playback:stop by returning to idle', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        state: 'playing',
        deckId: 'd',
        slideIndex: 0,
        startedAt: '2026-01-01T00:00:00.000Z',
        loop: false,
      }),
    );
    const { result } = renderHook(() => usePlayback());
    await waitFor(() => expect(result.current.state.state).toBe('playing'));

    act(() => {
      result.current.handleMessage({ type: 'playback:stop' });
    });

    expect(result.current.state).toEqual({ state: 'idle' });
  });

  it('start() POSTs to /api/playback/start with the deckId', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ state: 'idle' }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ state: 'playing', deckId: 'd1', slideIndex: 0, startedAt: 't', loop: false }),
    );

    const { result } = renderHook(() => usePlayback());
    await waitFor(() => expect(result.current.state.state).toBe('idle'));

    await act(async () => {
      await result.current.start('d1');
    });

    const [, call] = fetchMock.mock.calls;
    expect(call[0]).toBe('/api/playback/start');
    expect(call[1].method).toBe('POST');
    expect(JSON.parse(call[1].body)).toEqual({ deckId: 'd1' });
  });

  it('stop() POSTs to /api/playback/stop', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ state: 'idle' }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ state: 'idle' }));

    const { result } = renderHook(() => usePlayback());
    await waitFor(() => expect(result.current.state.state).toBe('idle'));

    await act(async () => {
      await result.current.stop();
    });

    const [, call] = fetchMock.mock.calls;
    expect(call[0]).toBe('/api/playback/stop');
    expect(call[1].method).toBe('POST');
  });

  it('exposes a stable handleMessage reference across renders', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ state: 'idle' }));
    const { result, rerender } = renderHook(() => usePlayback());
    await waitFor(() => expect(result.current.state.state).toBe('idle'));

    const first = result.current.handleMessage;
    rerender();
    expect(result.current.handleMessage).toBe(first);
  });
});
