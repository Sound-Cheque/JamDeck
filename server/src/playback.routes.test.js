import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDeckStore } from './decks.js';
import { createPlaybackController } from './playback.js';
import { createServer } from './server.js';

let dataDir;
let app;
let deckStore;
let broadcast;
let playbackController;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'jam-deck-playback-routes-'));
  deckStore = createDeckStore({ dataDir });
  broadcast = vi.fn();
  playbackController = createPlaybackController({ deckStore, broadcast });
  ({ app } = createServer({ deckStore, broadcast, playbackController }));
});

afterEach(async () => {
  playbackController.stop();
  await rm(dataDir, { recursive: true, force: true });
});

async function deckWithSlides(n = 2) {
  const d = await deckStore.createDeck({ name: 'D' });
  for (let i = 0; i < n; i++) {
    await deckStore.addSlide(d.id, { duration: { unit: 'seconds', value: 60 } });
  }
  return deckStore.getDeck(d.id);
}

describe('GET /api/playback', () => {
  it('returns idle when nothing is playing', async () => {
    const res = await request(app).get('/api/playback');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ state: 'idle' });
  });

  it('returns the playing state after a start', async () => {
    const deck = await deckWithSlides(2);
    await playbackController.start(deck.id);

    const res = await request(app).get('/api/playback');
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('playing');
    expect(res.body.deckId).toBe(deck.id);
    expect(res.body.slideIndex).toBe(0);
  });
});

describe('POST /api/playback/start', () => {
  it('starts playback for a valid deck and broadcasts playback:start', async () => {
    const deck = await deckWithSlides(2);
    broadcast.mockClear();

    const res = await request(app)
      .post('/api/playback/start')
      .send({ deckId: deck.id })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.state).toBe('playing');
    expect(res.body.deckId).toBe(deck.id);

    const start = broadcast.mock.calls.find((c) => c[0].type === 'playback:start');
    expect(start).toBeDefined();
    expect(start[0].deckId).toBe(deck.id);
  });

  it('returns 400 when deckId is missing', async () => {
    const res = await request(app)
      .post('/api/playback/start')
      .send({})
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/deckid/i);
  });

  it('returns 404 for an unknown deck', async () => {
    const res = await request(app)
      .post('/api/playback/start')
      .send({ deckId: '00000000-0000-0000-0000-000000000000' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(404);
  });

  it('returns 400 when the deck has no slides', async () => {
    const empty = await deckStore.createDeck({ name: 'Empty' });
    const res = await request(app)
      .post('/api/playback/start')
      .send({ deckId: empty.id })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no slides/i);
  });
});

describe('POST /api/playback/stop', () => {
  it('stops playback and broadcasts playback:stop', async () => {
    const deck = await deckWithSlides(2);
    await playbackController.start(deck.id);
    broadcast.mockClear();

    const res = await request(app).post('/api/playback/stop');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ state: 'idle' });
    expect(broadcast).toHaveBeenCalledWith({ type: 'playback:stop' });
  });

  it('is a 200 no-op when nothing is playing', async () => {
    const res = await request(app).post('/api/playback/stop');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ state: 'idle' });
    expect(broadcast).not.toHaveBeenCalled();
  });
});
