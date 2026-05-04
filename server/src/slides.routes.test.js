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
  dataDir = await mkdtemp(join(tmpdir(), 'jam-deck-slide-routes-'));
  deckStore = createDeckStore({ dataDir });
  ({ app } = createServer({ deckStore }));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('POST /api/decks/:id/slides', () => {
  it('appends a default canvas slide and returns 201 with the updated deck', async () => {
    const deck = await deckStore.createDeck({ name: 'D' });
    const res = await request(app).post(`/api/decks/${deck.id}/slides`);

    expect(res.status).toBe(201);
    expect(res.body.slides).toHaveLength(1);
    expect(res.body.slides[0].type).toBe('canvas');
    expect(res.body.slides[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('respects a partial slide in the body', async () => {
    const deck = await deckStore.createDeck({ name: 'D' });
    const res = await request(app)
      .post(`/api/decks/${deck.id}/slides`)
      .send({ type: 'image', content: { src: 'media/foo.jpg' } })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body.slides[0].type).toBe('image');
    expect(res.body.slides[0].content.src).toBe('media/foo.jpg');
  });

  it('returns 404 for an unknown deck', async () => {
    const res = await request(app).post(
      '/api/decks/00000000-0000-0000-0000-000000000000/slides',
    );
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/decks/:id/slides/:slideId', () => {
  it('updates a slide and returns the deck', async () => {
    const deck = await deckStore.createDeck({ name: 'D' });
    const withSlide = await deckStore.addSlide(deck.id);
    const slideId = withSlide.slides[0].id;

    const res = await request(app)
      .patch(`/api/decks/${deck.id}/slides/${slideId}`)
      .send({ duration: { unit: 'seconds', value: 60 } })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.slides[0].duration.value).toBe(60);
  });

  it('returns 404 when the slide does not exist', async () => {
    const deck = await deckStore.createDeck({ name: 'D' });
    const res = await request(app)
      .patch(`/api/decks/${deck.id}/slides/00000000-0000-0000-0000-000000000000`)
      .send({})
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/slide/i);
  });

  it('returns 404 when the deck does not exist', async () => {
    const res = await request(app)
      .patch('/api/decks/00000000-0000-0000-0000-000000000000/slides/x')
      .send({})
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/decks/:id/slides/:slideId', () => {
  it('removes the slide and returns the updated deck', async () => {
    const deck = await deckStore.createDeck({ name: 'D' });
    const withSlide = await deckStore.addSlide(deck.id);
    const slideId = withSlide.slides[0].id;

    const res = await request(app).delete(`/api/decks/${deck.id}/slides/${slideId}`);

    expect(res.status).toBe(200);
    expect(res.body.slides).toEqual([]);
  });

  it('returns 404 when the slide does not exist', async () => {
    const deck = await deckStore.createDeck({ name: 'D' });
    const res = await request(app).delete(
      `/api/decks/${deck.id}/slides/00000000-0000-0000-0000-000000000000`,
    );
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/decks/:id/slides/order', () => {
  it('reorders the slides to the supplied order', async () => {
    const deck = await deckStore.createDeck({ name: 'D' });
    const a = (await deckStore.addSlide(deck.id)).slides[0];
    const b = (await deckStore.addSlide(deck.id)).slides[1];
    const c = (await deckStore.addSlide(deck.id)).slides[2];

    const res = await request(app)
      .put(`/api/decks/${deck.id}/slides/order`)
      .send({ order: [c.id, a.id, b.id] })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.slides.map((s) => s.id)).toEqual([c.id, a.id, b.id]);
  });

  it('returns 400 for an order that does not match the existing slides', async () => {
    const deck = await deckStore.createDeck({ name: 'D' });
    const a = (await deckStore.addSlide(deck.id)).slides[0];

    const res = await request(app)
      .put(`/api/decks/${deck.id}/slides/order`)
      .send({ order: [a.id, 'extra'] })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/order/i);
  });

  it('returns 400 when order is missing', async () => {
    const deck = await deckStore.createDeck({ name: 'D' });
    const res = await request(app)
      .put(`/api/decks/${deck.id}/slides/order`)
      .send({})
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });

  it('returns 404 when the deck does not exist', async () => {
    const res = await request(app)
      .put('/api/decks/00000000-0000-0000-0000-000000000000/slides/order')
      .send({ order: [] })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(404);
  });
});
