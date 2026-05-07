import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDeckStore } from './decks.js';
import { createServer } from './server.js';

let dataDir;
let app;
let deckStore;
let broadcast;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'jam-deck-broadcast-'));
  deckStore = createDeckStore({ dataDir });
  broadcast = vi.fn();
  ({ app } = createServer({ deckStore, broadcast }));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('deck route broadcasts', () => {
  it('broadcasts deck:created on POST /api/decks', async () => {
    const res = await request(app)
      .post('/api/decks')
      .send({ name: 'Hello' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenCalledWith({
      type: 'deck:created',
      deck: res.body,
    });
  });

  it('broadcasts deck:update on PATCH /api/decks/:id', async () => {
    const deck = await deckStore.createDeck({ name: 'D' });
    broadcast.mockClear();

    const res = await request(app)
      .patch(`/api/decks/${deck.id}`)
      .send({ name: 'Renamed' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(broadcast).toHaveBeenCalledWith({
      type: 'deck:update',
      deck: res.body,
    });
  });

  it('broadcasts deck:deleted on DELETE /api/decks/:id', async () => {
    const deck = await deckStore.createDeck({ name: 'D' });
    broadcast.mockClear();

    const res = await request(app).delete(`/api/decks/${deck.id}`);

    expect(res.status).toBe(204);
    expect(broadcast).toHaveBeenCalledWith({
      type: 'deck:deleted',
      deckId: deck.id,
    });
  });

  it('broadcasts deck:update on POST /api/decks/:id/favorite', async () => {
    const deck = await deckStore.createDeck({ name: 'D' });
    broadcast.mockClear();

    const res = await request(app).post(`/api/decks/${deck.id}/favorite`);

    expect(res.status).toBe(200);
    expect(broadcast).toHaveBeenCalledWith({
      type: 'deck:update',
      deck: res.body,
    });
  });

  it('broadcasts deck:update on POST /api/decks/:id/slides', async () => {
    const deck = await deckStore.createDeck({ name: 'D' });
    broadcast.mockClear();

    const res = await request(app).post(`/api/decks/${deck.id}/slides`);

    expect(res.status).toBe(201);
    expect(broadcast).toHaveBeenCalledWith({
      type: 'deck:update',
      deck: res.body,
    });
  });

  it('broadcasts deck:update on PATCH and DELETE of a slide', async () => {
    const deck = await deckStore.createDeck({ name: 'D' });
    const withSlide = await deckStore.addSlide(deck.id);
    const slideId = withSlide.slides[0].id;
    broadcast.mockClear();

    const patch = await request(app)
      .patch(`/api/decks/${deck.id}/slides/${slideId}`)
      .send({ duration: { unit: 'seconds', value: 60 } })
      .set('Content-Type', 'application/json');
    expect(patch.status).toBe(200);

    const del = await request(app).delete(`/api/decks/${deck.id}/slides/${slideId}`);
    expect(del.status).toBe(200);

    expect(broadcast).toHaveBeenCalledTimes(2);
    expect(broadcast.mock.calls[0][0]).toEqual({ type: 'deck:update', deck: patch.body });
    expect(broadcast.mock.calls[1][0]).toEqual({ type: 'deck:update', deck: del.body });
  });

  it('broadcasts deck:update on PUT /api/decks/:id/slides/order', async () => {
    const deck = await deckStore.createDeck({ name: 'D' });
    const a = (await deckStore.addSlide(deck.id)).slides[0];
    const b = (await deckStore.addSlide(deck.id)).slides[1];
    broadcast.mockClear();

    const res = await request(app)
      .put(`/api/decks/${deck.id}/slides/order`)
      .send({ order: [b.id, a.id] })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(broadcast).toHaveBeenCalledWith({ type: 'deck:update', deck: res.body });
  });

  it('does not broadcast on 4xx responses', async () => {
    // Empty name → 400
    await request(app)
      .post('/api/decks')
      .send({ name: '' })
      .set('Content-Type', 'application/json');

    // Unknown deck → 404
    await request(app).delete('/api/decks/00000000-0000-0000-0000-000000000000');

    // Missing order → 400
    const deck = await deckStore.createDeck({ name: 'D' });
    broadcast.mockClear();
    await request(app)
      .put(`/api/decks/${deck.id}/slides/order`)
      .send({})
      .set('Content-Type', 'application/json');

    expect(broadcast).not.toHaveBeenCalled();
  });
});
