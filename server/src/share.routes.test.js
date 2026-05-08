import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createShareController } from './share.js';
import { createShareRouter } from './share.routes.js';

let app;
let tunnel;

function makeApp({ failOnStart = false } = {}) {
  const factory = vi.fn(async (opts) => {
    if (failOnStart) throw new Error('auth failed');
    tunnel = {
      _opts: opts,
      url: () => 'https://abc.ngrok-free.app',
      close: vi.fn(async () => {}),
    };
    return tunnel;
  });
  const controller = createShareController({ tunnelFactory: factory, port: 4000 });
  const a = express();
  a.use(express.json());
  a.use('/api/share', createShareRouter(controller));
  return { app: a, controller, factory };
}

beforeEach(() => {
  tunnel = null;
});

describe('share routes', () => {
  it('GET /api/share returns inactive before start', async () => {
    ({ app } = makeApp());
    const res = await request(app).get('/api/share');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ active: false });
  });

  it('POST /api/share/start opens a tunnel and returns the URL', async () => {
    ({ app } = makeApp());
    const res = await request(app).post('/api/share/start');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      active: true,
      url: 'https://abc.ngrok-free.app',
    });
  });

  it('POST /api/share/stop closes the tunnel and returns inactive', async () => {
    ({ app } = makeApp());
    await request(app).post('/api/share/start');
    const res = await request(app).post('/api/share/stop');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ active: false });
    expect(tunnel.close).toHaveBeenCalled();
  });

  it('POST /api/share/start returns 502 with the underlying error message on failure', async () => {
    ({ app } = makeApp({ failOnStart: true }));
    const res = await request(app).post('/api/share/start');
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/auth failed/);
  });
});
