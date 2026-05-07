import { useEffect, useRef } from 'react';

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

/**
 * Maintains a persistent WebSocket connection. Reconnects on disconnect with
 * exponential backoff. JSON-decodes incoming messages and dispatches them to
 * `handler`. Handler updates don't reopen the socket.
 *
 * Intentionally minimal — there's no `send` here yet because broadcasts are
 * one-way (server → client) for now. REST mutations remain the write path.
 */
export function useWebSocket(url, handler) {
  // Stash the handler in a ref so the effect doesn't tear the socket down
  // every time the parent re-renders with a new closure.
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    let cancelled = false;
    let ws = null;
    let reconnectTimer = null;
    let backoff = INITIAL_BACKOFF_MS;

    function connect() {
      if (cancelled) return;
      ws = new WebSocket(url);
      ws.onopen = () => {
        backoff = INITIAL_BACKOFF_MS;
      };
      ws.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return; // ignore malformed
        }
        handlerRef.current?.(data);
      };
      ws.onclose = () => {
        if (cancelled) return;
        reconnectTimer = setTimeout(() => {
          backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
          connect();
        }, backoff);
      };
      ws.onerror = () => {
        // Errors precede onclose, which handles the reconnect.
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null; // suppress reconnect on intentional close
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
    };
  }, [url]);
}
