// @vitest-environment node
// Importing vite.config.js pulls in @vitejs/plugin-react → esbuild, which
// can't initialize under jsdom's TextEncoder shim. Run this one in node.
import { describe, it, expect } from 'vitest';
import config from '../../vite.config.js';

// Regression: every backend path the client hits in dev must be proxied to
// the API server on :4000. We tripped over this when adding image slides —
// uploads went to /api/media (proxied) but displays went to /media/<hash>
// (NOT proxied), and Vite quietly served its own 404. Then we tripped over it
// again with WebSockets — putting our endpoint at /ws collided with Vite's
// own HMR upgrade routing, so the live-sync WS now lives under /api/ws.
describe('vite dev proxy', () => {
  const proxy = config.server.proxy;

  it('proxies /api to the API server with WebSocket support', () => {
    expect(proxy['/api']).toMatchObject({
      target: 'http://localhost:4000',
      ws: true,
    });
  });

  it('proxies /media to the API server (so uploaded files render in dev)', () => {
    expect(proxy['/media']).toBe('http://localhost:4000');
  });

  it('does not have a top-level /ws proxy (it conflicts with Vite HMR)', () => {
    expect(proxy['/ws']).toBeUndefined();
  });
});
