import { useEffect } from 'react';
import { nextBeatAtOrAfter } from '../utils/metronome.js';

// Schedules metronome beats while playback is active. Beats and accents
// are derived purely from the canonical startedAt + bpm, so every client
// stays in sync without any clock messages from the server. Disabled is
// a no-op (no scheduling, no player calls).
export function useMetronome({
  enabled,
  startedAt,
  bpm,
  beatsPerBar = 4,
  player,
}) {
  useEffect(() => {
    if (!enabled) return undefined;
    if (!Number.isFinite(bpm) || bpm <= 0) return undefined;
    if (!startedAt || !player) return undefined;

    const startedAtMs = new Date(startedAt).getTime();
    const beatMs = 60_000 / bpm;
    let timer = null;
    let cancelled = false;

    function scheduleAt(beatNumber) {
      if (cancelled) return;
      const atMs = startedAtMs + beatNumber * beatMs;
      const delay = atMs - Date.now();
      timer = setTimeout(() => {
        if (cancelled) return;
        const isAccent = beatNumber % beatsPerBar === 0;
        try {
          player.play(isAccent ? 'accent' : 'beat');
        } catch {
          /* swallow — keep scheduling regardless */
        }
        scheduleAt(beatNumber + 1);
      }, Math.max(0, delay));
    }

    const next = nextBeatAtOrAfter(startedAtMs, bpm, Date.now());
    if (next) scheduleAt(next.beatNumber);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, startedAt, bpm, beatsPerBar, player]);
}
