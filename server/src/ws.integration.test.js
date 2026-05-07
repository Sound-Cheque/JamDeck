// End-to-end check: a REST mutation reaches connected WebSocket clients.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import request from 'supertest';
import { createDeckStore } from './decks.js';
import { createServer } from './server.js';

let dataDir;
let httpServer;
let app;
let port;

async function listen() {
  return new Promise((resolve) => {
    httpServer.listen(0, () => resolve(httpServer.address().port));
  });
}

async function close() {
  return new Promise((resolve, reject) => {
    httpServer.close((err) => (err ? reject(err) : resolve()));
  });
}

function nextMessage(ws) {
  return new Promise((resolve, reject) => {
    ws.once('message', (data) => {
      try {
        resolve(JSON.parse(data.toString()));
      } catch (err) {
        reject(err);
      }
    });
    ws.once('error', reject);
  });
}

function waitForOpen(ws) {
  return new Promise((resolve, reject) => {
    if (ws.readyState === ws.OPEN) return resolve();
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'jam-deck-ws-'));
  const deckStore = createDeckStore({ dataDir });
  ({ app, httpServer } = createServer({ deckStore }));
  port = await listen();
});

afterEach(async () => {
  await close();
  await rm(dataDir, { recursive: true, force: true });
});

describe('WebSocket broadcast', () => {
  it('delivers deck:created to a connected client when a deck is created via REST', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/api/ws`);
    await waitForOpen(ws);

    const messageP = nextMessage(ws);

    const createRes = await request(app)
      .post('/api/decks')
      .send({ name: 'WS deck' })
      .set('Content-Type', 'application/json');
    expect(createRes.status).toBe(201);

    const message = await messageP;
    expect(message.type).toBe('deck:created');
    expect(message.deck.id).toBe(createRes.body.id);
    expect(message.deck.name).toBe('WS deck');

    ws.close();
  });

  it('fans out a single mutation to multiple connected clients', async () => {
    const a = new WebSocket(`ws://localhost:${port}/api/ws`);
    const b = new WebSocket(`ws://localhost:${port}/api/ws`);
    await Promise.all([waitForOpen(a), waitForOpen(b)]);

    const aMsg = nextMessage(a);
    const bMsg = nextMessage(b);

    await request(app)
      .post('/api/decks')
      .send({ name: 'Fanout' })
      .set('Content-Type', 'application/json');

    const [msgA, msgB] = await Promise.all([aMsg, bMsg]);
    expect(msgA.type).toBe('deck:created');
    expect(msgB.type).toBe('deck:created');
    expect(msgA.deck.id).toBe(msgB.deck.id);

    a.close();
    b.close();
  });

  it('rejects upgrade requests on paths other than /api/ws', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    await new Promise((resolve) => {
      ws.once('error', resolve);
      ws.once('unexpected-response', resolve);
    });
    expect(ws.readyState).not.toBe(ws.OPEN);
  });
});
