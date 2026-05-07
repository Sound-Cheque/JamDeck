// Server-authoritative playback state machine.
//
// Holds at most one playing deck at a time. The deck is snapshotted at start —
// changes to slides during playback are not reflected until the next start
// (keeps slide-advance synchronous and decouples playback from disk I/O).
//
// Advances between slides via setTimeout. Emits messages through the supplied
// `broadcast` function:
//   - { type: 'playback:start', deckId, slideIndex, startedAt, loop }
//   - { type: 'playback:slide', slideIndex, startedAt }
//   - { type: 'playback:stop' }
// `now` is injectable so tests can pin time.

import { slideDurationMs } from './timing.js';

export function createPlaybackController({ deckStore, broadcast = () => {}, now = () => Date.now() } = {}) {
  let state = { state: 'idle' };
  let activeDeck = null;
  let timer = null;

  function getState() {
    return { ...state };
  }

  async function start(deckId) {
    const deck = await deckStore.getDeck(deckId); // throws DeckNotFoundError
    if (!deck.slides || deck.slides.length === 0) {
      throw new Error(`Cannot start playback: deck ${deckId} has no slides`);
    }
    cancelTimer();
    activeDeck = deck;
    setSlide(0, /* announceStart */ true);
  }

  function stop() {
    if (state.state !== 'playing') return;
    cancelTimer();
    state = { state: 'idle' };
    activeDeck = null;
    broadcast({ type: 'playback:stop' });
  }

  function setSlide(slideIndex, announceStart) {
    const slide = activeDeck.slides[slideIndex];
    const startedAt = new Date(now()).toISOString();
    state = {
      state: 'playing',
      deckId: activeDeck.id,
      slideIndex,
      startedAt,
      loop: !!activeDeck.settings?.loop,
    };
    if (announceStart) {
      broadcast({ type: 'playback:start', ...state });
    } else {
      broadcast({ type: 'playback:slide', slideIndex, startedAt });
    }
    scheduleAdvance(slide);
  }

  function scheduleAdvance(slide) {
    const ms = slideDurationMs(slide, activeDeck.settings);
    if (ms == null) return; // bars-mode under Link timing — driven elsewhere
    timer = setTimeout(advance, ms);
  }

  function advance() {
    timer = null;
    if (state.state !== 'playing') return;
    const next = state.slideIndex + 1;
    if (next < activeDeck.slides.length) {
      setSlide(next, false);
    } else if (activeDeck.settings?.loop) {
      setSlide(0, false);
    } else {
      stop();
    }
  }

  function cancelTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return { getState, start, stop };
}
