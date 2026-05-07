// @vitest-environment node
// Importing vite.config.js pulls in @vitejs/plugin-react → esbuild, which
// can't initialize under jsdom's TextEncoder shim. Run this one in node.
import { describe, it, expect } from 'vitest';
import config from '../../vite.config.js';

// Regression: every backend path the client hits in dev must be proxied to
// the API server on :4000. We tripped over this when adding image slides —
// uploads went to /api/media (proxied) but displays went to /media/<hash>
// (NOT proxied), and Vite quietly served its own 404. Lock it in.
describe('vite dev proxy', () => {
  const proxy = config.server.proxy;

  it('proxies /api to the API server', () => {
    expect(proxy['/api']).toBe('http://localhost:4000');
  });

  it('proxies /media to the API server (so uploaded files render in dev)', () => {
    expect(proxy['/media']).toBe('http://localhost:4000');
  });

  it('proxies /ws as a WebSocket to the API server', () => {
    expect(proxy['/ws']).toMatchObject({
      target: 'ws://localhost:4000',
      ws: true,
    });
  });
});
