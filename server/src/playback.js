// Server-authoritative playback state machine.
//
// Holds at most one playing deck at a time. The deck is snapshotted at start —
// changes to slides during playback are not reflected until the next start
// (keeps slide-advance synchronous and decouples playback from disk I/O).
//
// Advances between slides via setTimeout. Emits messages through the supplied
// `broadcast` function:
//   - { type: 'playback:start', deckId, slideIndex, startedAt, loop, linkBpm? }
//   - { type: 'playback:slide', slideIndex, startedAt }
//   - { type: 'playback:stop' }
//
// `linkBridge` (optional) drives bars-mode timing under `timingMode === 'link'`:
//   - Slide duration computed from linkBridge.getTempo() at slide start.
//   - Tempo changes mid-slide reschedule the advance preserving bars played.
//   - start() can quantize to the next bar boundary via msUntilNextBar() — the
//     controller enters a transient 'pending' state until the boundary fires.
//   - Transport sharing: in Link mode, start() / stop() also flip the Link
//     transport play state. An external `playState` event (DAW pressed
//     play / stop) triggers the controller to start the last-played deck or
//     stop the current one.
//
// `now` is injectable so tests can pin time.

import { barsToMs, msToBars, slideDurationMs } from './timing.js';

export function createPlaybackController({
  deckStore,
  broadcast = () => {},
  now = () => Date.now(),
  linkBridge = null,
} = {}) {
  let state = { state: 'idle' };
  let activeDeck = null;
  let timer = null;
  let pendingTimer = null;
  // Last deck the user explicitly started — used to re-arm playback when
  // the DAW (an external Link peer) presses Play.
  let lastDeckId = null;

  // Per-slide bookkeeping for tempo-responsive Link timing. `slideBarsLeft`
  // tracks remaining bars from the current `slideStartedAtMs` reference point;
  // we never mutate the deck snapshot's slide.
  let slideStartedAtMs = null;
  let slideBpmAtStart = null;
  let slideBarsLeft = null;
  let unsubscribeTempo = null;

  // Subscribe to external transport changes from the Link peer. Stays
  // active for the controller's lifetime — controllers live for the whole
  // server lifetime.
  if (linkBridge && typeof linkBridge.on === 'function') {
    linkBridge.on('playState', onExternalPlayState);
  }

  function onExternalPlayState(playing) {
    if (playing) {
      // External Play. If we're idle (or pending) and have an armed deck,
      // start it. If already playing, ignore. Returns the start() promise
      // so callers (and tests) that care can await it; errors are swallowed
      // because the bridge has no way to surface them.
      if (state.state === 'playing') return undefined;
      if (!lastDeckId) return undefined;
      return start(lastDeckId, /* fromExternal */ true).catch(() => {});
    } else if (state.state === 'playing' || state.state === 'pending') {
      stop({ fromExternal: true });
    }
    return undefined;
  }

  function getState() {
    return { ...state };
  }

  // Returns the slide id of the currently-playing slide, or null when idle /
  // pending. Used by the deck router to enforce the current-slide-lock that
  // mobile clients respect (the "🔒 cannot edit the live slide" rule).
  function getActiveSlideId() {
    if (state.state !== 'playing') return null;
    if (!activeDeck) return null;
    return activeDeck.slides?.[state.slideIndex]?.id ?? null;
  }

  async function start(deckId, fromExternal = false) {
    const deck = await deckStore.getDeck(deckId); // throws DeckNotFoundError
    if (!deck.slides || deck.slides.length === 0) {
      throw new Error(`Cannot start playback: deck ${deckId} has no slides`);
    }
    cancelTimers();
    cleanupTempoSub();
    activeDeck = deck;
    lastDeckId = deckId;

    // Outbound transport sharing: in Link mode, tell the DAW to play. Skip
    // when this start() was triggered by an external playState event (we'd
    // be echoing the DAW's own command back at it).
    if (
      !fromExternal &&
      deck.settings?.timingMode === 'link' &&
      linkBridge?.isEnabled?.() &&
      typeof linkBridge.setIsPlaying === 'function'
    ) {
      linkBridge.setIsPlaying(true);
    }

    // Quantized start: in Link mode, delay slide 0 to the next bar boundary.
    if (
      deck.settings?.timingMode === 'link' &&
      linkBridge?.isEnabled?.() &&
      typeof linkBridge.msUntilNextBar === 'function'
    ) {
      const delay = linkBridge.msUntilNextBar();
      if (Number.isFinite(delay) && delay > 0) {
        state = { state: 'pending', deckId: deck.id };
        broadcast({ type: 'playback:pending', deckId: deck.id });
        pendingTimer = setTimeout(() => {
          pendingTimer = null;
          if (state.state !== 'pending' || state.deckId !== deck.id) return;
          setSlide(0, /* announceStart */ true);
        }, delay);
        return;
      }
    }

    setSlide(0, /* announceStart */ true);
  }

  function stop({ fromExternal = false } = {}) {
    if (state.state !== 'playing' && state.state !== 'pending') return;
    const wasLinkMode = activeDeck?.settings?.timingMode === 'link';
    cancelTimers();
    cleanupTempoSub();
    state = { state: 'idle' };
    activeDeck = null;
    broadcast({ type: 'playback:stop' });

    // Outbound transport sharing: tell the DAW to stop. Skipped when this
    // stop() was triggered by an external playState=false (would echo).
    if (
      !fromExternal &&
      wasLinkMode &&
      linkBridge?.isEnabled?.() &&
      typeof linkBridge.setIsPlaying === 'function'
    ) {
      linkBridge.setIsPlaying(false);
    }
  }

  function setSlide(slideIndex, announceStart) {
    cleanupTempoSub();
    const slide = activeDeck.slides[slideIndex];
    const startedAt = new Date(now()).toISOString();
    const isLink = activeDeck.settings?.timingMode === 'link';
    const linkBpm = isLink ? linkBridge?.getTempo?.() ?? null : null;

    state = {
      state: 'playing',
      deckId: activeDeck.id,
      slideIndex,
      startedAt,
      loop: !!activeDeck.settings?.loop,
    };
    if (linkBpm != null) state.linkBpm = linkBpm;

    if (announceStart) {
      broadcast({ type: 'playback:start', ...state });
    } else {
      broadcast({ type: 'playback:slide', slideIndex, startedAt });
    }

    slideStartedAtMs = now();
    slideBpmAtStart = linkBpm;
    slideBarsLeft =
      slide?.duration?.unit === 'bars' && Number.isFinite(slide.duration.value)
        ? slide.duration.value
        : null;
    scheduleAdvance(slide);
  }

  function scheduleAdvance(slide) {
    // Standard path: seconds-mode, or bars-mode under internal clock.
    const ms = slideDurationMs(slide, activeDeck.settings);
    if (ms != null) {
      timer = setTimeout(advance, ms);
      return;
    }

    // Bars-mode under Link timing: derive ms from live tempo. Subscribe to
    // tempo changes so we can reschedule the advance if the DAW changes BPM.
    if (
      activeDeck.settings?.timingMode === 'link' &&
      slide?.duration?.unit === 'bars' &&
      Number.isFinite(slide.duration.value) &&
      linkBridge?.isEnabled?.()
    ) {
      const bpm = linkBridge.getTempo?.();
      if (Number.isFinite(bpm) && bpm > 0) {
        const linkMs = barsToMs(slide.duration.value, bpm);
        timer = setTimeout(advance, linkMs);
      }
      // Subscribe even if BPM isn't ready yet — first tempo event will schedule.
      unsubscribeTempo = linkBridge.on?.('tempo', onLinkTempo);
    }
  }

  function onLinkTempo(newBpm) {
    if (state.state !== 'playing') return;
    const slide = activeDeck.slides[state.slideIndex];
    if (slide?.duration?.unit !== 'bars') return;
    if (!Number.isFinite(newBpm) || newBpm <= 0) return;
    if (slideBarsLeft == null) return;

    const elapsedMs = now() - slideStartedAtMs;
    // Bars played at the previous tempo. If we never had a tempo (shouldn't
    // happen, but be safe), fall back to newBpm so we don't get NaN.
    const bpmForElapsed =
      Number.isFinite(slideBpmAtStart) && slideBpmAtStart > 0 ? slideBpmAtStart : newBpm;
    const barsPlayed = msToBars(elapsedMs, bpmForElapsed);
    const barsRemaining = Math.max(0, slideBarsLeft - barsPlayed);

    cancelAdvanceTimer();

    // Update bookkeeping so the next tempo change calculates from this point.
    slideStartedAtMs = now();
    slideBpmAtStart = newBpm;
    slideBarsLeft = barsRemaining;

    if (barsRemaining <= 0) {
      // Already past the slide — fire advance on next tick to keep semantics
      // consistent (don't synchronously re-enter setSlide from a tempo event).
      timer = setTimeout(advance, 0);
      return;
    }
    timer = setTimeout(advance, barsToMs(barsRemaining, newBpm));
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

  function cancelAdvanceTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function cancelTimers() {
    cancelAdvanceTimer();
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
  }

  function cleanupTempoSub() {
    if (typeof unsubscribeTempo === 'function') {
      try { unsubscribeTempo(); } catch { /* ignore */ }
    }
    unsubscribeTempo = null;
    slideStartedAtMs = null;
    slideBpmAtStart = null;
    slideBarsLeft = null;
  }

  return { getState, getActiveSlideId, start, stop };
}
