// Two-client concurrent-edit test. The spec says any client can edit any
// slide (except the currently playing one), with last-write-wins as the
// conflict-resolution policy. Last-write-wins emerges from the per-deck
// write queue + atomic rename in decks.js — this test pins that behavior.

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
  dataDir = await mkdtemp(join(tmpdir(), 'jam-deck-conflict-'));
  deckStore = createDeckStore({ dataDir });
  ({ app } = createServer({ deckStore }));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('concurrent edits — last-write-wins', () => {
  it('two PATCHes to the same slide both succeed; the later one wins', async () => {
    const deck = await deckStore.createDeck({ name: 'Race' });
    await deckStore.addSlide(deck.id, {
      duration: { unit: 'seconds', value: 10 },
    });
    const slide = (await deckStore.getDeck(deck.id)).slides[0];

    // Fire both PATCHes in the same tick — order of arrival is what matters.
    const [resA, resB] = await Promise.all([
      request(app)
        .patch(`/api/decks/${deck.id}/slides/${slide.id}`)
        .send({ duration: { unit: 'seconds', value: 11 } })
        .set('Content-Type', 'application/json'),
      request(app)
        .patch(`/api/decks/${deck.id}/slides/${slide.id}`)
        .send({ duration: { unit: 'seconds', value: 22 } })
        .set('Content-Type', 'application/json'),
    ]);

    // Both succeed (no conflicts surface to the client)
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    // The persisted value matches one of the two — supertest doesn't
    // guarantee which fires first, but the queue + atomic rename means
    // the file is never half-written and one of them is the final state.
    const after = await deckStore.getDeck(deck.id);
    expect([11, 22]).toContain(after.slides[0].duration.value);
  });

  it('a deck-level patch and a slide-level patch round-trip cleanly under contention', async () => {
    const deck = await deckStore.createDeck({ name: 'D' });
    await deckStore.addSlide(deck.id, {
      duration: { unit: 'seconds', value: 10 },
    });
    const slide = (await deckStore.getDeck(deck.id)).slides[0];

    const [resName, resSlide] = await Promise.all([
      request(app)
        .patch(`/api/decks/${deck.id}`)
        .send({ name: 'Renamed' })
        .set('Content-Type', 'application/json'),
      request(app)
        .patch(`/api/decks/${deck.id}/slides/${slide.id}`)
        .send({ duration: { unit: 'seconds', value: 99 } })
        .set('Content-Type', 'application/json'),
    ]);

    expect(resName.status).toBe(200);
    expect(resSlide.status).toBe(200);

    // Both edits land — deck name updated AND slide duration updated
    const after = await deckStore.getDeck(deck.id);
    expect(after.name).toBe('Renamed');
    expect(after.slides[0].duration.value).toBe(99);
  });

  it('mobile-style whole-slide replacement is the explicit last-writer', async () => {
    const deck = await deckStore.createDeck({ name: 'D' });
    await deckStore.addSlide(deck.id, {
      duration: { unit: 'seconds', value: 10 },
      content: { objects: [], background: '#fff' },
    });
    const slide = (await deckStore.getDeck(deck.id)).slides[0];

    // Simulate: desktop edits content live, then mobile sends a whole-slide
    // replacement. Mobile's PATCH wins because it arrives later.
    await request(app)
      .patch(`/api/decks/${deck.id}/slides/${slide.id}`)
      .send({ content: { objects: [{ kind: 'rect' }], background: '#fff' } })
      .set('Content-Type', 'application/json');

    await request(app)
      .patch(`/api/decks/${deck.id}/slides/${slide.id}`)
      .send({
        duration: { unit: 'seconds', value: 7 },
        content: { objects: [], background: '#000' }, // wholesale replacement
      })
      .set('Content-Type', 'application/json');

    const after = await deckStore.getDeck(deck.id);
    expect(after.slides[0].duration.value).toBe(7);
    expect(after.slides[0].content).toEqual({ objects: [], background: '#000' });
  });
});
