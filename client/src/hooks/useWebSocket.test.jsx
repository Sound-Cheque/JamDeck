import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from './useWebSocket.js';

// Minimal mock of the global WebSocket — enough to drive the hook through
// open / message / close / reconnect cycles deterministically.
class MockWebSocket {
  static instances = [];
  static OPEN = 1;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.OPEN = 1;
    this.CLOSED = 3;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.closed = false;
    MockWebSocket.instances.push(this);
  }
  // Test helpers
  fakeOpen() {
    this.readyState = 1;
    this.onopen?.({});
  }
  fakeMessage(data) {
    this.onmessage?.({ data });
  }
  fakeClose() {
    this.readyState = 3;
    this.onclose?.({});
  }
  // Mock of the real API
  close() {
    this.closed = true;
    this.fakeClose();
  }
  send() {}
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useWebSocket', () => {
  it('opens a WebSocket to the supplied URL on mount', () => {
    renderHook(() => useWebSocket('/ws', () => {}));
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toBe('/ws');
  });

  it('dispatches incoming JSON messages to the handler', () => {
    const handler = vi.fn();
    renderHook(() => useWebSocket('/ws', handler));
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.fakeOpen();
      ws.fakeMessage(JSON.stringify({ type: 'deck:update', deck: { id: 'a' } }));
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ type: 'deck:update', deck: { id: 'a' } });
  });

  it('ignores malformed JSON without calling the handler', () => {
    const handler = vi.fn();
    renderHook(() => useWebSocket('/ws', handler));
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.fakeOpen();
      ws.fakeMessage('not json {');
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('closes the socket on unmount and does not reconnect', () => {
    const { unmount } = renderHook(() => useWebSocket('/ws', () => {}));
    const ws = MockWebSocket.instances[0];

    unmount();

    expect(ws.closed).toBe(true);

    // Even after a reconnect timer would have fired, no second instance:
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('reconnects after an unexpected close', () => {
    renderHook(() => useWebSocket('/ws', () => {}));
    const first = MockWebSocket.instances[0];

    act(() => {
      first.fakeOpen();
      first.fakeClose();
    });

    expect(MockWebSocket.instances).toHaveLength(1);

    // Advance past the initial backoff
    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(MockWebSocket.instances.length).toBeGreaterThan(1);
    expect(MockWebSocket.instances.at(-1).url).toBe('/ws');
  });

  it('handler updates affect the next message dispatch', () => {
    let handler = vi.fn();
    const { rerender } = renderHook(({ h }) => useWebSocket('/ws', h), {
      initialProps: { h: handler },
    });
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.fakeOpen();
      ws.fakeMessage(JSON.stringify({ type: 'first' }));
    });
    expect(handler).toHaveBeenCalledWith({ type: 'first' });

    const newHandler = vi.fn();
    rerender({ h: newHandler });

    act(() => {
      ws.fakeMessage(JSON.stringify({ type: 'second' }));
    });

    expect(newHandler).toHaveBeenCalledWith({ type: 'second' });
    // Handler swap should not reopen the socket:
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});
