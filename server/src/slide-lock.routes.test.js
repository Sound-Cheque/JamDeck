// Tests for the "current-slide lock": while a deck is playing, the slide at
// the live playback index cannot be edited or deleted, and the deck itself
// cannot be deleted. Other slides remain freely editable.

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
let playbackController;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'jam-deck-slide-lock-'));
  deckStore = createDeckStore({ dataDir });
  ({ app, playbackController } = createServer({ deckStore }));
});

afterEach(async () => {
  playbackController?.stop?.();
  await rm(dataDir, { recursive: true, force: true });
});

async function makePlayingDeck() {
  const deck = await deckStore.createDeck({ name: 'L' });
  // Three slides, long durations so playback doesn't auto-advance during the test
  for (let i = 0; i < 3; i++) {
    await deckStore.addSlide(deck.id, {
      duration: { unit: 'seconds', value: 600 },
    });
  }
  await playbackController.start(deck.id);
  return deckStore.getDeck(deck.id);
}

describe('current-slide lock', () => {
  it('rejects PATCH on the currently-playing slide with 409', async () => {
    const deck = await makePlayingDeck();
    const playing = deck.slides[0];

    const res = await request(app)
      .patch(`/api/decks/${deck.id}/slides/${playing.id}`)
      .send({ duration: { unit: 'seconds', value: 5 } })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/locked|playing/i);

    // The slide on disk should be unchanged
    const after = await deckStore.getDeck(deck.id);
    expect(after.slides[0].duration.value).toBe(600);
  });

  it('allows PATCH on a non-playing slide', async () => {
    const deck = await makePlayingDeck();
    const other = deck.slides[1];

    const res = await request(app)
      .patch(`/api/decks/${deck.id}/slides/${other.id}`)
      .send({ duration: { unit: 'seconds', value: 7 } })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    const after = await deckStore.getDeck(deck.id);
    expect(after.slides[1].duration.value).toBe(7);
  });

  it('rejects DELETE on the currently-playing slide with 409', async () => {
    const deck = await makePlayingDeck();
    const playing = deck.slides[0];

    const res = await request(app).delete(
      `/api/decks/${deck.id}/slides/${playing.id}`,
    );

    expect(res.status).toBe(409);
    const after = await deckStore.getDeck(deck.id);
    expect(after.slides).toHaveLength(3);
  });

  it('allows DELETE on a non-playing slide', async () => {
    const deck = await makePlayingDeck();
    const other = deck.slides[2];

    const res = await request(app).delete(
      `/api/decks/${deck.id}/slides/${other.id}`,
    );

    expect(res.status).toBe(200);
    const after = await deckStore.getDeck(deck.id);
    expect(after.slides).toHaveLength(2);
  });

  it('rejects DELETE on the entire deck while it is playing', async () => {
    const deck = await makePlayingDeck();
    const res = await request(app).delete(`/api/decks/${deck.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/playing|locked/i);
    // Deck should still exist
    const list = await deckStore.listDecks();
    expect(list.find((d) => d.id === deck.id)).toBeTruthy();
  });

  it('allows DELETE on a different deck while another is playing', async () => {
    const playing = await makePlayingDeck();
    const other = await deckStore.createDeck({ name: 'O' });

    const res = await request(app).delete(`/api/decks/${other.id}`);
    expect(res.status).toBe(204);

    const list = await deckStore.listDecks();
    expect(list.find((d) => d.id === playing.id)).toBeTruthy();
    expect(list.find((d) => d.id === other.id)).toBeFalsy();
  });

  it('once playback stops, the previously-playing slide becomes editable', async () => {
    const deck = await makePlayingDeck();
    const wasPlaying = deck.slides[0];
    playbackController.stop();

    const res = await request(app)
      .patch(`/api/decks/${deck.id}/slides/${wasPlaying.id}`)
      .send({ duration: { unit: 'seconds', value: 3 } })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
  });
});
