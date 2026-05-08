import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useShare } from './useShare.js';

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

describe('useShare', () => {
  it('hydrates initial status from /api/share', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ active: false }));
    const { result } = renderHook(() => useShare());
    await waitFor(() => expect(result.current.status).toEqual({ active: false }));
  });

  it('start() POSTs and updates status with the returned URL', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ active: false }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ active: true, url: 'https://x.ngrok-free.app' }),
    );
    const { result } = renderHook(() => useShare());
    await waitFor(() => expect(result.current.status.active).toBe(false));

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toEqual({
      active: true,
      url: 'https://x.ngrok-free.app',
    });
  });

  it('start() surfaces server errors via the `error` field', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ active: false }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'auth failed' }, { status: 502 }),
    );
    const { result } = renderHook(() => useShare());
    await waitFor(() => expect(result.current.status.active).toBe(false));

    await act(async () => {
      await result.current.start().catch(() => {});
    });
    expect(result.current.error).toMatch(/auth failed/);
  });

  it('stop() POSTs and updates status to inactive', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ active: true, url: 'https://x.ngrok-free.app' }),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ active: false }));
    const { result } = renderHook(() => useShare());
    await waitFor(() => expect(result.current.status.active).toBe(true));

    await act(async () => {
      await result.current.stop();
    });
    expect(result.current.status).toEqual({ active: false });
  });
});
