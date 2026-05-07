import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDeckStore, DeckNotFoundError } from './decks.js';
import { createPlaybackController } from './playback.js';

let dataDir;
let deckStore;
let broadcast;
let controller;
let deck;

async function makeDeck({ slides = 1, loop = false, durations = [10, 10, 10] } = {}) {
  const d = await deckStore.createDeck({ name: 'D' });
  if (loop) await deckStore.updateDeck(d.id, { settings: { loop: true } });
  for (let i = 0; i < slides; i++) {
    await deckStore.addSlide(d.id, {
      duration: { unit: 'seconds', value: durations[i] ?? 10 },
    });
  }
  return deckStore.getDeck(d.id);
}

beforeEach(async () => {
  vi.useFakeTimers();
  dataDir = await mkdtemp(join(tmpdir(), 'jam-deck-playback-'));
  deckStore = createDeckStore({ dataDir });
  broadcast = vi.fn();
  controller = createPlaybackController({ deckStore, broadcast });
});

afterEach(async () => {
  controller.stop();
  vi.useRealTimers();
  await rm(dataDir, { recursive: true, force: true });
});

describe('initial state', () => {
  it('reports idle before anything starts', () => {
    expect(controller.getState()).toEqual({ state: 'idle' });
  });
});

describe('start', () => {
  it('emits playback:start carrying deckId, slideIndex 0, startedAt, loop', async () => {
    deck = await makeDeck({ slides: 2 });
    await controller.start(deck.id);

    expect(broadcast).toHaveBeenCalledTimes(1);
    const msg = broadcast.mock.calls[0][0];
    expect(msg.type).toBe('playback:start');
    expect(msg.deckId).toBe(deck.id);
    expect(msg.slideIndex).toBe(0);
    expect(msg.loop).toBe(false);
    expect(typeof msg.startedAt).toBe('string');
    expect(new Date(msg.startedAt).toString()).not.toBe('Invalid Date');
  });

  it('updates getState to playing', async () => {
    deck = await makeDeck();
    await controller.start(deck.id);

    const s = controller.getState();
    expect(s.state).toBe('playing');
    expect(s.deckId).toBe(deck.id);
    expect(s.slideIndex).toBe(0);
  });

  it('rejects an unknown deck id', async () => {
    await expect(
      controller.start('00000000-0000-0000-0000-000000000000'),
    ).rejects.toBeInstanceOf(DeckNotFoundError);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('rejects starting a deck with no slides', async () => {
    deck = await makeDeck({ slides: 0 });
    await expect(controller.start(deck.id)).rejects.toThrow(/no slides/i);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('restarts from slide 0 if called while already playing', async () => {
    deck = await makeDeck({ slides: 3, durations: [5, 5, 5] });
    await controller.start(deck.id);
    await vi.advanceTimersByTimeAsync(5_000); // advance to slide 1
    expect(controller.getState().slideIndex).toBe(1);

    broadcast.mockClear();
    await controller.start(deck.id);
    expect(controller.getState().slideIndex).toBe(0);
    expect(broadcast.mock.calls[0][0].type).toBe('playback:start');
  });
});

describe('automatic slide advance', () => {
  it('emits playback:slide after the current slide duration elapses', async () => {
    deck = await makeDeck({ slides: 2, durations: [3, 3] });
    await controller.start(deck.id);
    broadcast.mockClear();

    await vi.advanceTimersByTimeAsync(3_000);

    expect(broadcast).toHaveBeenCalledTimes(1);
    const msg = broadcast.mock.calls[0][0];
    expect(msg.type).toBe('playback:slide');
    expect(msg.slideIndex).toBe(1);
    expect(typeof msg.startedAt).toBe('string');
    expect(controller.getState().slideIndex).toBe(1);
  });

  it('continues advancing through every slide', async () => {
    deck = await makeDeck({ slides: 3, durations: [2, 2, 2] });
    await controller.start(deck.id);
    broadcast.mockClear();

    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(2_000);

    const types = broadcast.mock.calls.map((c) => c[0].type);
    const indexes = broadcast.mock.calls.map((c) => c[0].slideIndex);
    expect(types).toEqual(['playback:slide', 'playback:slide']);
    expect(indexes).toEqual([1, 2]);
  });

  it('emits playback:stop after the last slide when loop is false', async () => {
    deck = await makeDeck({ slides: 2, durations: [2, 2] });
    await controller.start(deck.id);
    broadcast.mockClear();

    await vi.advanceTimersByTimeAsync(2_000); // → slide 1
    await vi.advanceTimersByTimeAsync(2_000); // end of last

    const last = broadcast.mock.calls.at(-1)[0];
    expect(last.type).toBe('playback:stop');
    expect(controller.getState()).toEqual({ state: 'idle' });
  });

  it('loops back to slide 0 after the last slide when loop is true', async () => {
    deck = await makeDeck({ slides: 2, loop: true, durations: [2, 2] });
    await controller.start(deck.id);
    broadcast.mockClear();

    await vi.advanceTimersByTimeAsync(2_000); // → slide 1
    await vi.advanceTimersByTimeAsync(2_000); // → loop to slide 0

    const last = broadcast.mock.calls.at(-1)[0];
    expect(last.type).toBe('playback:slide');
    expect(last.slideIndex).toBe(0);
    expect(controller.getState().slideIndex).toBe(0);
  });
});

describe('stop', () => {
  it('emits playback:stop and returns to idle', async () => {
    deck = await makeDeck({ slides: 2 });
    await controller.start(deck.id);
    broadcast.mockClear();

    controller.stop();

    expect(broadcast).toHaveBeenCalledWith({ type: 'playback:stop' });
    expect(controller.getState()).toEqual({ state: 'idle' });
  });

  it('cancels pending advances', async () => {
    deck = await makeDeck({ slides: 2, durations: [5, 5] });
    await controller.start(deck.id);
    controller.stop();
    broadcast.mockClear();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(broadcast).not.toHaveBeenCalled();
  });

  it('is a no-op when already idle', () => {
    controller.stop();
    expect(broadcast).not.toHaveBeenCalled();
  });
});
