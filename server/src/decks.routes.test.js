import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDeckStore } from './decks.js';
import { createServer } from './server.js';

let dataDir;
let app;
let deckStore;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'jam-deck-routes-'));
  deckStore = createDeckStore({ dataDir });
  ({ app } = createServer({ deckStore }));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('GET /api/decks', () => {
  it('returns an empty list when no decks exist', async () => {
    const res = await request(app).get('/api/decks');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns summaries for created decks', async () => {
    const a = await deckStore.createDeck({ name: 'Alpha' });
    const b = await deckStore.createDeck({ name: 'Beta' });

    const res = await request(app).get('/api/decks');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    const ids = res.body.map((d) => d.id).sort();
    expect(ids).toEqual([a.id, b.id].sort());

    for (const summary of res.body) {
      expect(summary).not.toHaveProperty('slides');
      expect(summary).not.toHaveProperty('settings');
      expect(summary).toHaveProperty('slideCount');
    }
  });
});

describe('POST /api/decks', () => {
  it('creates a deck and returns 201 with the full deck', async () => {
    const res = await request(app)
      .post('/api/decks')
      .send({ name: 'Created via API' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Created via API');
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.slides).toEqual([]);
    expect(res.body.settings.timingMode).toBe('duration');

    const persisted = await deckStore.getDeck(res.body.id);
    expect(persisted).toEqual(res.body);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/decks').send({}).set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it('returns 400 when name is empty or whitespace', async () => {
    const res = await request(app)
      .post('/api/decks')
      .send({ name: '   ' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/decks/:id', () => {
  it('returns the full deck', async () => {
    const deck = await deckStore.createDeck({ name: 'Detail' });
    const res = await request(app).get(`/api/decks/${deck.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(deck);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/decks/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 404 for malformed id (path traversal attempt)', async () => {
    const res = await request(app).get('/api/decks/..%2Fescape');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/decks/:id', () => {
  it('updates the deck and returns the merged result', async () => {
    const deck = await deckStore.createDeck({ name: 'Patch me' });
    const res = await request(app)
      .patch(`/api/decks/${deck.id}`)
      .send({ name: 'Patched', settings: { internalBpm: 90 } })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Patched');
    expect(res.body.settings.internalBpm).toBe(90);
    expect(res.body.settings.timerStyle).toBe('backgroundFill');
    expect(res.body.id).toBe(deck.id);
    expect(res.body.createdAt).toBe(deck.createdAt);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .patch('/api/decks/00000000-0000-0000-0000-000000000000')
      .send({ name: 'X' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/decks/:id', () => {
  it('deletes the deck and returns 204', async () => {
    const deck = await deckStore.createDeck({ name: 'Doomed' });
    const res = await request(app).delete(`/api/decks/${deck.id}`);
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});

    const list = await deckStore.listDecks();
    expect(list).toHaveLength(0);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).delete('/api/decks/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/decks/:id/favorite', () => {
  it('toggles the favorite flag and returns the updated deck', async () => {
    const deck = await deckStore.createDeck({ name: 'Fav' });
    const res = await request(app).post(`/api/decks/${deck.id}/favorite`);
    expect(res.status).toBe(200);
    expect(res.body.favorite).toBe(true);

    const res2 = await request(app).post(`/api/decks/${deck.id}/favorite`);
    expect(res2.body.favorite).toBe(false);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).post(
      '/api/decks/00000000-0000-0000-0000-000000000000/favorite',
    );
    expect(res.status).toBe(404);
  });
});
