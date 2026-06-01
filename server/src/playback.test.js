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

  it('getActiveSlideId returns null while idle', () => {
    expect(controller.getActiveSlideId()).toBeNull();
  });
});

describe('getActiveSlideId', () => {
  it('returns the playing slide id while playing', async () => {
    deck = await makeDeck({ slides: 2, durations: [5, 5] });
    await controller.start(deck.id);
    expect(controller.getActiveSlideId()).toBe(deck.slides[0].id);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(controller.getActiveSlideId()).toBe(deck.slides[1].id);
  });

  it('returns null after stop', async () => {
    deck = await makeDeck({ slides: 1 });
    await controller.start(deck.id);
    controller.stop();
    expect(controller.getActiveSlideId()).toBeNull();
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

  it('advances bars-mode slides at the deck BPM under internal-clock timing', async () => {
    const d = await deckStore.createDeck({ name: 'D' });
    await deckStore.updateDeck(d.id, {
      settings: { timingMode: 'internal', internalBpm: 120 },
    });
    // 4 bars at 120 BPM in 4/4 = 4 * 4 * 500ms = 8000ms
    await deckStore.addSlide(d.id, { duration: { unit: 'bars', value: 4 } });
    await deckStore.addSlide(d.id, { duration: { unit: 'bars', value: 4 } });
    deck = await deckStore.getDeck(d.id);

    await controller.start(deck.id);
    broadcast.mockClear();

    // Just before the 4-bar mark: still on slide 0
    await vi.advanceTimersByTimeAsync(7_999);
    expect(controller.getState().slideIndex).toBe(0);

    // Cross the 4-bar mark: advance to slide 1
    await vi.advanceTimersByTimeAsync(2);
    expect(controller.getState().slideIndex).toBe(1);
    expect(broadcast.mock.calls.at(-1)[0].type).toBe('playback:slide');
  });

  it('does not auto-advance bars-mode slides under Link timing (handled elsewhere)', async () => {
    const d = await deckStore.createDeck({ name: 'D' });
    await deckStore.updateDeck(d.id, {
      settings: { timingMode: 'link', internalBpm: 120 },
    });
    await deckStore.addSlide(d.id, { duration: { unit: 'bars', value: 1 } });
    await deckStore.addSlide(d.id, { duration: { unit: 'bars', value: 1 } });
    deck = await deckStore.getDeck(d.id);

    await controller.start(deck.id);
    broadcast.mockClear();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(controller.getState().slideIndex).toBe(0);
    expect(broadcast).not.toHaveBeenCalled();
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

// Helper: create a fake Link bridge whose tempo / msUntilNextBar can be
// controlled from within tests, and whose events can be fired manually.
function makeFakeLinkBridge({ enabled = true, bpm = 120, msUntilNextBar = 0 } = {}) {
  const listeners = new Map(); // event -> Set<fn>
  let _bpm = bpm;
  let _next = msUntilNextBar;
  let _enabled = enabled;
  let _isPlaying = false;
  const setIsPlayingCalls = [];
  const bridge = {
    isEnabled: () => _enabled,
    getTempo: () => _bpm,
    getNumPeers: () => 0,
    getIsPlaying: () => _isPlaying,
    setIsPlaying: (val) => {
      _isPlaying = !!val;
      setIsPlayingCalls.push(_isPlaying);
    },
    msUntilNextBar: () => _next,
    on: (event, fn) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return () => listeners.get(event)?.delete(fn);
    },
    off: (event, fn) => listeners.get(event)?.delete(fn),
    enable: async () => { _enabled = true; },
    disable: () => { _enabled = false; },
    // Test helpers
    _setBpm(newBpm) {
      _bpm = newBpm;
      const set = listeners.get('tempo');
      if (set) for (const fn of set) fn(newBpm);
    },
    _setMsUntilNextBar(v) { _next = v; },
    async _emitPlayState(playing) {
      _isPlaying = !!playing;
      const set = listeners.get('playState');
      if (!set) return;
      // Listeners may return a Promise (controller.onExternalPlayState does
      // when it triggers start). Await all of them so tests can synchronize.
      await Promise.all([...set].map((fn) => fn(_isPlaying)));
    },
    _setIsPlayingCalls: setIsPlayingCalls,
  };
  return bridge;
}

describe('Ableton Link timing', () => {
  it('advances bars-mode slides using the live Link tempo when timingMode is "link"', async () => {
    const linkBridge = makeFakeLinkBridge({ bpm: 120 });
    controller = createPlaybackController({ deckStore, broadcast, linkBridge });

    const d = await deckStore.createDeck({ name: 'D' });
    await deckStore.updateDeck(d.id, { settings: { timingMode: 'link' } });
    // 2 bars at 120 BPM in 4/4 = 2 × 4 × 500ms = 4000ms
    await deckStore.addSlide(d.id, { duration: { unit: 'bars', value: 2 } });
    await deckStore.addSlide(d.id, { duration: { unit: 'bars', value: 2 } });
    deck = await deckStore.getDeck(d.id);

    await controller.start(deck.id);
    broadcast.mockClear();

    // Just before the 2-bar mark: still on slide 0
    await vi.advanceTimersByTimeAsync(3_999);
    expect(controller.getState().slideIndex).toBe(0);

    // Cross the 2-bar mark: advance to slide 1
    await vi.advanceTimersByTimeAsync(2);
    expect(controller.getState().slideIndex).toBe(1);
  });

  it('reschedules remaining time when Link tempo changes mid-slide (bars preserved)', async () => {
    const linkBridge = makeFakeLinkBridge({ bpm: 120 });
    controller = createPlaybackController({ deckStore, broadcast, linkBridge });

    const d = await deckStore.createDeck({ name: 'D' });
    await deckStore.updateDeck(d.id, { settings: { timingMode: 'link' } });
    // 4 bars at 120 BPM = 8000ms; at 60 BPM the same 4 bars would be 16000ms
    await deckStore.addSlide(d.id, { duration: { unit: 'bars', value: 4 } });
    await deckStore.addSlide(d.id, { duration: { unit: 'bars', value: 1 } });
    deck = await deckStore.getDeck(d.id);

    await controller.start(deck.id);
    broadcast.mockClear();

    // Halfway through (4000ms = 2 bars at 120 BPM)
    await vi.advanceTimersByTimeAsync(4_000);
    expect(controller.getState().slideIndex).toBe(0);

    // Tempo halves to 60 BPM. Bars played so far = 2; remaining 2 bars at
    // 60 BPM = 8000ms. So advance happens 8000ms from now (12000ms total).
    linkBridge._setBpm(60);

    // Just before new boundary: still slide 0
    await vi.advanceTimersByTimeAsync(7_999);
    expect(controller.getState().slideIndex).toBe(0);

    // Cross the new boundary: advance to slide 1
    await vi.advanceTimersByTimeAsync(2);
    expect(controller.getState().slideIndex).toBe(1);
  });

  it('shortens remaining time when tempo speeds up mid-slide', async () => {
    const linkBridge = makeFakeLinkBridge({ bpm: 60 });
    controller = createPlaybackController({ deckStore, broadcast, linkBridge });

    const d = await deckStore.createDeck({ name: 'D' });
    await deckStore.updateDeck(d.id, { settings: { timingMode: 'link' } });
    // 4 bars at 60 BPM = 16000ms
    await deckStore.addSlide(d.id, { duration: { unit: 'bars', value: 4 } });
    await deckStore.addSlide(d.id, { duration: { unit: 'bars', value: 1 } });
    deck = await deckStore.getDeck(d.id);

    await controller.start(deck.id);
    broadcast.mockClear();

    // Play for 8s at 60 BPM — that's 2 bars done.
    await vi.advanceTimersByTimeAsync(8_000);

    // Tempo quadruples to 240 BPM. Remaining 2 bars at 240 BPM = 2000ms.
    linkBridge._setBpm(240);

    await vi.advanceTimersByTimeAsync(1_999);
    expect(controller.getState().slideIndex).toBe(0);

    await vi.advanceTimersByTimeAsync(2);
    expect(controller.getState().slideIndex).toBe(1);
  });

  it('quantized start delays slide 0 to the next bar boundary in Link mode', async () => {
    // The bridge says we're 750ms away from the next bar.
    const linkBridge = makeFakeLinkBridge({ bpm: 120, msUntilNextBar: 750 });
    controller = createPlaybackController({ deckStore, broadcast, linkBridge });

    const d = await deckStore.createDeck({ name: 'D' });
    await deckStore.updateDeck(d.id, { settings: { timingMode: 'link' } });
    await deckStore.addSlide(d.id, { duration: { unit: 'bars', value: 1 } });
    deck = await deckStore.getDeck(d.id);

    await controller.start(deck.id);
    // Should have broadcast playback:pending immediately, but not playback:start yet
    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'playback:pending', deckId: deck.id }),
    );
    expect(broadcast).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'playback:start' }),
    );
    expect(controller.getState().state).toBe('pending');

    await vi.advanceTimersByTimeAsync(749);
    expect(broadcast).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'playback:start' }),
    );

    await vi.advanceTimersByTimeAsync(2);
    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'playback:start', slideIndex: 0 }),
    );
    expect(controller.getState().state).toBe('playing');
  });

  it('quantized start can be cancelled by stop() before the bar boundary', async () => {
    const linkBridge = makeFakeLinkBridge({ bpm: 120, msUntilNextBar: 1_000 });
    controller = createPlaybackController({ deckStore, broadcast, linkBridge });

    const d = await deckStore.createDeck({ name: 'D' });
    await deckStore.updateDeck(d.id, { settings: { timingMode: 'link' } });
    await deckStore.addSlide(d.id, { duration: { unit: 'bars', value: 1 } });
    deck = await deckStore.getDeck(d.id);

    await controller.start(deck.id);
    expect(controller.getState().state).toBe('pending');

    controller.stop();
    expect(controller.getState()).toEqual({ state: 'idle' });

    await vi.advanceTimersByTimeAsync(2_000);
    // Only the playback:stop from cancellation; no playback:start should fire.
    const types = broadcast.mock.calls.map((c) => c[0].type);
    expect(types).not.toContain('playback:start');
  });

  it('does not delay start when msUntilNextBar is 0 (already on a boundary)', async () => {
    const linkBridge = makeFakeLinkBridge({ bpm: 120, msUntilNextBar: 0 });
    controller = createPlaybackController({ deckStore, broadcast, linkBridge });

    const d = await deckStore.createDeck({ name: 'D' });
    await deckStore.updateDeck(d.id, { settings: { timingMode: 'link' } });
    await deckStore.addSlide(d.id, { duration: { unit: 'bars', value: 1 } });
    deck = await deckStore.getDeck(d.id);

    await controller.start(deck.id);
    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'playback:start' }),
    );
    expect(controller.getState().state).toBe('playing');
  });

  it('includes linkBpm in playback:start broadcast when in Link mode', async () => {
    const linkBridge = makeFakeLinkBridge({ bpm: 132 });
    controller = createPlaybackController({ deckStore, broadcast, linkBridge });

    const d = await deckStore.createDeck({ name: 'D' });
    await deckStore.updateDeck(d.id, { settings: { timingMode: 'link' } });
    await deckStore.addSlide(d.id, { duration: { unit: 'bars', value: 1 } });
    deck = await deckStore.getDeck(d.id);

    await controller.start(deck.id);
    expect(broadcast.mock.calls[0][0].linkBpm).toBe(132);
  });
});

describe('Link transport sharing', () => {
  it('calls linkBridge.setIsPlaying(true) on start in Link mode', async () => {
    const linkBridge = makeFakeLinkBridge({ bpm: 120 });
    controller = createPlaybackController({ deckStore, broadcast, linkBridge });

    const d = await deckStore.createDeck({ name: 'D' });
    await deckStore.updateDeck(d.id, { settings: { timingMode: 'link' } });
    await deckStore.addSlide(d.id, { duration: { unit: 'bars', value: 1 } });
    deck = await deckStore.getDeck(d.id);

    await controller.start(deck.id);
    expect(linkBridge._setIsPlayingCalls).toEqual([true]);
  });

  it('calls linkBridge.setIsPlaying(false) on stop in Link mode', async () => {
    const linkBridge = makeFakeLinkBridge({ bpm: 120 });
    controller = createPlaybackController({ deckStore, broadcast, linkBridge });

    const d = await deckStore.createDeck({ name: 'D' });
    await deckStore.updateDeck(d.id, { settings: { timingMode: 'link' } });
    await deckStore.addSlide(d.id, { duration: { unit: 'bars', value: 1 } });
    deck = await deckStore.getDeck(d.id);

    await controller.start(deck.id);
    controller.stop();
    expect(linkBridge._setIsPlayingCalls).toEqual([true, false]);
  });

  it('does not touch linkBridge.setIsPlaying when not in Link mode', async () => {
    const linkBridge = makeFakeLinkBridge({ bpm: 120 });
    controller = createPlaybackController({ deckStore, broadcast, linkBridge });

    deck = await makeDeck({ slides: 1, durations: [10] });
    await controller.start(deck.id);
    controller.stop();
    expect(linkBridge._setIsPlayingCalls).toEqual([]);
  });

  it('starts the last-played deck when an external playState=true event fires', async () => {
    const linkBridge = makeFakeLinkBridge({ bpm: 120 });
    controller = createPlaybackController({ deckStore, broadcast, linkBridge });

    const d = await deckStore.createDeck({ name: 'D' });
    await deckStore.updateDeck(d.id, { settings: { timingMode: 'link' } });
    await deckStore.addSlide(d.id, { duration: { unit: 'bars', value: 1 } });
    deck = await deckStore.getDeck(d.id);

    // First a user-initiated start, then stop. lastDeckId is now armed.
    await controller.start(deck.id);
    controller.stop();
    broadcast.mockClear();
    linkBridge._setIsPlayingCalls.length = 0;

    // External Play. start() is async (deckStore.getDeck reads from disk),
    // so we have to flush both the microtask queue and any timers it sets.
    await linkBridge._emitPlayState(true);

    expect(controller.getState().state).toBe('playing');
    expect(broadcast.mock.calls.some((c) => c[0].type === 'playback:start')).toBe(true);
  });

  it('does not echo setIsPlaying back when responding to external playState=true', async () => {
    const linkBridge = makeFakeLinkBridge({ bpm: 120 });
    controller = createPlaybackController({ deckStore, broadcast, linkBridge });

    const d = await deckStore.createDeck({ name: 'D' });
    await deckStore.updateDeck(d.id, { settings: { timingMode: 'link' } });
    await deckStore.addSlide(d.id, { duration: { unit: 'bars', value: 1 } });
    deck = await deckStore.getDeck(d.id);

    // Arm lastDeckId
    await controller.start(deck.id);
    controller.stop();
    linkBridge._setIsPlayingCalls.length = 0;

    // External Play arrives
    await linkBridge._emitPlayState(true);

    // We should NOT have called setIsPlaying again — that would be an echo.
    expect(linkBridge._setIsPlayingCalls).toEqual([]);
  });

  it('stops local playback when an external playState=false event fires', async () => {
    const linkBridge = makeFakeLinkBridge({ bpm: 120 });
    controller = createPlaybackController({ deckStore, broadcast, linkBridge });

    const d = await deckStore.createDeck({ name: 'D' });
    await deckStore.updateDeck(d.id, { settings: { timingMode: 'link' } });
    await deckStore.addSlide(d.id, { duration: { unit: 'bars', value: 1 } });
    deck = await deckStore.getDeck(d.id);

    await controller.start(deck.id);
    broadcast.mockClear();
    linkBridge._setIsPlayingCalls.length = 0;

    await linkBridge._emitPlayState(false);

    expect(controller.getState()).toEqual({ state: 'idle' });
    expect(broadcast.mock.calls.some((c) => c[0].type === 'playback:stop')).toBe(true);
    // No echo — we shouldn't call setIsPlaying(false) in response to an
    // external false (the DAW already knows it stopped).
    expect(linkBridge._setIsPlayingCalls).toEqual([]);
  });

  it('ignores external playState=true when no deck has been armed', async () => {
    const linkBridge = makeFakeLinkBridge({ bpm: 120 });
    controller = createPlaybackController({ deckStore, broadcast, linkBridge });

    await linkBridge._emitPlayState(true);

    expect(controller.getState()).toEqual({ state: 'idle' });
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('ignores external playState=true while already playing', async () => {
    const linkBridge = makeFakeLinkBridge({ bpm: 120 });
    controller = createPlaybackController({ deckStore, broadcast, linkBridge });

    const d = await deckStore.createDeck({ name: 'D' });
    await deckStore.updateDeck(d.id, { settings: { timingMode: 'link' } });
    await deckStore.addSlide(d.id, { duration: { unit: 'bars', value: 1 } });
    await deckStore.addSlide(d.id, { duration: { unit: 'bars', value: 1 } });
    deck = await deckStore.getDeck(d.id);

    await controller.start(deck.id);
    const startCallsBefore = broadcast.mock.calls.filter(
      (c) => c[0].type === 'playback:start',
    ).length;

    await linkBridge._emitPlayState(true);

    const startCallsAfter = broadcast.mock.calls.filter(
      (c) => c[0].type === 'playback:start',
    ).length;
    expect(startCallsAfter).toBe(startCallsBefore); // no extra start
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
