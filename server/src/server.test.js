import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createServer } from './server.js';

describe('server smoke', () => {
  it('responds to /api/health', async () => {
    const { app } = createServer();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
